/**
 * Client for the AOItemQueryService (the shared item database).
 *
 * Every call goes through `request`, so a dead service, an HTTP error and a
 * malformed body all arrive as one recognisable error type instead of as a
 * `SyntaxError` from `res.json()` half a stack away. The service runs on
 * localhost alongside the game, so "not running" is the normal case rather
 * than an exception, and callers are expected to catch.
 */

const BASE = "http://localhost:7070";

/** Anything that went wrong talking to the item database. */
export class ItemDbError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ItemDbError";
  }
}

async function request(path, body) {
  const url = `${BASE}${path}`;

  let res;
  try {
    res = await fetch(
      url,
      body === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch (cause) {
    throw new ItemDbError(`item database unreachable: ${path}`, { cause });
  }

  if (!res.ok) {
    throw new ItemDbError(`item database returned ${res.status} for ${path}`);
  }

  try {
    return await res.json();
  } catch (cause) {
    throw new ItemDbError(`item database sent malformed JSON for ${path}`, {
      cause,
    });
  }
}

/** Ids reaching the service must be positive integers; anything else is noise. */
const validIds = (ids) =>
  (ids ?? []).filter((id) => Number.isInteger(id) && id > 0);

const iconUrl = (data) => (data ? `data:image/png;base64,${data}` : null);

/**
 * The service sends `members` as a JSON string, but a stubbed or newer
 * backend may well send the array itself. Accept both rather than throwing a
 * parse error out of a search.
 */
function parseMembers(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function searchItems({
  name = "",
  id = null,
  ids = null,
  idPairs = null,
  limit = 50,
  offset = 0,
  canBits,
  itemBits,
  modFilter,
  statFilter,
  reqFilter,
} = {}) {
  const rows = await request("/search", {
    name: name || undefined,
    id: id || undefined,
    ids: ids?.length ? ids : undefined,
    idPairs: idPairs?.length ? idPairs : undefined,
    limit,
    offset,
    // The flag filters were being passed in by the caller and silently
    // dropped here, so the whole Flags panel did nothing to the results.
    //
    // NOTE: sending them is now correct, but as of 2026-09-20 the running
    // AOItemQueryService ignores both — a search with every bit set returns
    // exactly the same rows as one with none. `modFilter`, `statFilter` and
    // `reqFilter` were checked the same way and do filter. So the Flags
    // panel will stay inert until the service implements these two; there
    // is nothing further the front end can do about it.
    canBits: canBits || undefined,
    itemBits: itemBits || undefined,
    modFilter,
    statFilter,
    reqFilter,
  });

  return (rows ?? []).map((item) => ({
    ...item,
    members: parseMembers(item.members),
  }));
}

export const getItemStats = (id) => request(`/item?id=${id}`);
export const getItemModifiers = (id) => request(`/item/modifiers?id=${id}`);
export const getItemModifierCriteria = (id) =>
  request(`/item/modifiers/criteria?id=${id}`);
export const getItemModifierText = (id) =>
  request(`/item/modifiers/text?id=${id}`);
export const getItemRequirements = (id) => request(`/item/requirements?id=${id}`);
export const getItemSkillChecks = (id) => request(`/item/skillchecks?id=${id}`);
export const getItemMembers = (lowId) => request(`/item/members?lowId=${lowId}`);

export async function getItemIcons(ids) {
  const wanted = validIds(ids);
  if (!wanted.length) return {};

  const rows = await request(`/items/icons?ids=${wanted.join(",")}`);
  return Object.fromEntries(
    (rows ?? []).map((r) => [r.item_id, iconUrl(r.iconData)]),
  );
}

export async function getIcon(iconId) {
  if (!Number.isInteger(iconId) || iconId <= 0) return null;

  // A missing icon is ordinary — the mission has none — so this one call
  // answers null instead of raising.
  try {
    const row = await request(`/icons?id=${iconId}`);
    return iconUrl(row?.iconData);
  } catch {
    return null;
  }
}

export async function getItemNames(ids) {
  const wanted = validIds(ids);
  if (!wanted.length) return {};

  const rows = await request(`/items/names?ids=${wanted.join(",")}`);
  return Object.fromEntries((rows ?? []).map((r) => [r.id, r.name]));
}

/**
 * The two templates a QL sits between.
 *
 * An exact match answers itself for both ends, so the caller interpolates
 * between a template and itself and gets that template's values back.
 */
export function findBracketingTemplates(members, selectedQl) {
  const sorted = [...members].sort((a, b) => a.ql - b.ql);

  const exact = sorted.find((m) => m.ql === selectedQl);
  if (exact) return { low: exact, high: exact };

  const low = [...sorted].reverse().find((m) => m.ql <= selectedQl) ?? sorted[0];
  const high = sorted.find((m) => m.ql >= selectedQl) ?? sorted[sorted.length - 1];

  return { low, high };
}
