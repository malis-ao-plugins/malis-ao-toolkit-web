const BASE = "http://localhost:7070";

export async function searchItems({
  name = "",
  id = null,
  ids = null,
  idPairs = null,
  limit = 50,
  offset = 0,
  modFilter,
  statFilter,
  reqFilter,
} = {}) {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name || undefined,
      id: id || undefined,
      ids: ids?.length ? ids : undefined,
      idPairs: idPairs?.length ? idPairs : undefined,
      limit,
      offset,
      modFilter,
      statFilter,
      reqFilter,
    }),
  });

  const data = await res.json();
  const result = data.map((item) => ({
    ...item,
    members: JSON.parse(item.members),
  }));

  return result;
}

export async function getItemStats(id) {
  const res = await fetch(`${BASE}/item?id=${id}`);
  return res.json();
}

export async function getItemModifiers(id) {
  const res = await fetch(`${BASE}/item/modifiers?id=${id}`);
  return res.json();
}

export async function getItemModifierCriteria(id) {
  const res = await fetch(`${BASE}/item/modifiers/criteria?id=${id}`);
  return res.json();
}

export async function getItemModifierText(id) {
  const res = await fetch(`${BASE}/item/modifiers/text?id=${id}`);
  return res.json();
}

export async function getItemRequirements(id) {
  const res = await fetch(`${BASE}/item/requirements?id=${id}`);
  return res.json();
}

export async function getItemIcons(ids) {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (!validIds.length) return {};
  const res = await fetch(`${BASE}/items/icons?ids=${validIds.join(",")}`);
  const rows = await res.json();
  return Object.fromEntries(
    rows.map((r) => [
      r.item_id,
      r.iconData ? `data:image/png;base64,${r.iconData}` : null,
    ]),
  );
}

export async function getIcon(iconId) {
  if (!Number.isInteger(iconId) || iconId <= 0) return null;

  const res = await fetch(`${BASE}/icons?id=${iconId}`);
  if (!res.ok) return null;

  const row = await res.json();
  return row.iconData ? `data:image/png;base64,${row.iconData}` : null;
}

export async function resolveItem(lowId, highId) {
  const res = await fetch(
    `${BASE}/item/resolve?lowId=${lowId}&highId=${highId}`,
  );

  if (!res.ok) throw new Error(`resolve failed: ${lowId}/${highId}`);
  return res.json();
}

export async function getItemNames(ids) {
  if (!ids.length) return {};
  const res = await fetch(`${BASE}/items/names?ids=${ids.join(",")}`);
  const rows = await res.json();
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export async function getItemSkillChecks(id) {
  const res = await fetch(`${BASE}/item/skillchecks?id=${id}`);
  return res.json();
}

export async function getItemMembers(lowId) {
  const res = await fetch(`${BASE}/item/members?lowId=${lowId}`);
  return res.json();
}

export function findBracketingTemplates(members, selectedQl) {
  const sorted = [...members].sort((a, b) => a.ql - b.ql);

  // exact match
  const exact = sorted.find((m) => m.ql === selectedQl);
  if (exact) return { low: exact, high: exact };

  // find the two members that bracket the selected QL
  const low =
    [...sorted].reverse().find((m) => m.ql <= selectedQl) ?? sorted[0];
  const high =
    sorted.find((m) => m.ql >= selectedQl) ?? sorted[sorted.length - 1];

  return { low, high };
}
