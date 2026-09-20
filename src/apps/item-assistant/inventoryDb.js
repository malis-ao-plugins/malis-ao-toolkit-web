const BASE = "http://localhost:7068";

export async function getCharacters() {
  const res = await fetch(`${BASE}/characters`);
  return res.json(); // [{ id, name, last_seen }]
}

export async function getCharacterItems(characterId) {
  const res = await fetch(`${BASE}/character/items?characterId=${characterId}`);
  return res.json();
  // [{ slot, item_id, item_high_id, ql, container_name,
  //    parent_type, parent_instance }]
}

export async function getCharacterContainers(characterId) {
  const res = await fetch(
    `${BASE}/character/containers?characterId=${characterId}`,
  );
  return res.json();
  // [{ type, instance, name, parent_type, parent_instance, parent_slot }]
}

export async function getContainerItems(
  characterId,
  containerInstance,
  containerType,
) {
  const res = await fetch(
    `${BASE}/container/items?characterId=${characterId}&instance=${containerInstance}&type=${containerType}`,
  );
  return res.json(); // [{ slot, item_id, item_high_id, ql, added_at }]
}

export async function getItemPath(
  characterId,
  containerInstance,
  containerType,
  slot,
) {
  const res = await fetch(
    `${BASE}/item/path?characterId=${characterId}&instance=${containerInstance}&type=${containerType}&slot=${slot}`,
  );
  return res.json(); // [{ instance, type, slot }] root → target
}
