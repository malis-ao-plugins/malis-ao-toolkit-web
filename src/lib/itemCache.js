import { getItemIcons, getItemMembers, getItemNames } from "./db";

/**
 * One cache for the item database, shared by everything that reads it.
 *
 * The data behind these calls does not change while the app is running — an
 * item's templates, its name and its icon are fixed — so anything fetched
 * once is kept. That matters more than it sounds: every item row mounts its
 * own tooltip hook, so a per-hook cache meant hovering the same item in two
 * rows fetched it twice, and a fifty-entry roll list issued three requests
 * per entry because nothing was shared between them.
 *
 * Requests in flight are coalesced as well as results: ten rows asking for
 * the same icon at once produce one request, not ten. Names and icons are
 * batched, so a caller hands over every id it needs and gets back one
 * request for whichever of them are not already known.
 *
 * A failed request is not cached, so the next attempt tries again.
 */

const members = new Map(); // lowId -> Promise<member[]>
const names = { value: new Map(), pending: new Map() };
const icons = { value: new Map(), pending: new Map() };

/** The service can repeat a template; the UI wants each one once. */
const uniqueById = (rows) => {
  const seen = new Set();
  return (rows ?? []).filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

/** Every template in an item's family, lowest QL first. */
export function membersOf(lowId) {
  const hit = members.get(lowId);
  if (hit) return hit;

  const request = getItemMembers(lowId)
    .then(uniqueById)
    .catch((err) => {
      members.delete(lowId);
      throw err;
    });

  members.set(lowId, request);
  return request;
}

const usable = (ids) =>
  [...new Set(ids ?? [])].filter((id) => Number.isInteger(id) && id > 0);

/**
 * Resolve many ids through one batched request, skipping what is already
 * known and joining whatever is already on its way.
 */
async function resolveMany(ids, store, fetchMany) {
  const wanted = usable(ids);
  if (!wanted.length) return {};

  const missing = wanted.filter(
    (id) => !store.value.has(id) && !store.pending.has(id),
  );

  if (missing.length) {
    const request = fetchMany(missing)
      .then((found) => {
        for (const id of missing) {
          store.value.set(id, found[id] ?? null);
          store.pending.delete(id);
        }
      })
      .catch((err) => {
        for (const id of missing) store.pending.delete(id);
        throw err;
      });

    for (const id of missing) store.pending.set(id, request);
  }

  await Promise.all(
    [...new Set(wanted.map((id) => store.pending.get(id)))].filter(Boolean),
  );

  return Object.fromEntries(
    wanted.map((id) => [id, store.value.get(id) ?? null]),
  );
}

/** id -> name, for every id asked about. */
export const namesOf = (ids) => resolveMany(ids, names, getItemNames);

/** id -> icon data URL (or null), for every id asked about. */
export const iconsOf = (ids) => resolveMany(ids, icons, getItemIcons);

/** Only for tests — nothing in the app has a reason to forget. */
export function clearItemCache() {
  members.clear();
  names.value.clear();
  names.pending.clear();
  icons.value.clear();
  icons.pending.clear();
}
