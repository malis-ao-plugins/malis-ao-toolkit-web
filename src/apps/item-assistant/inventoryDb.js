/**
 * HTTP endpoints belonging to the Item Assistant plugin.
 *
 * Separate from src/lib/db.js on purpose: that is the shared item database
 * every app reads, this is one plugin's own inventory store. Same failure
 * treatment though — a plugin that is not running is the normal case, so it
 * arrives as a named error rather than a JSON parse failure.
 */

const BASE = "http://localhost:7068";

export class InventoryDbError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "InventoryDbError";
  }
}

async function request(path) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  } catch (cause) {
    throw new InventoryDbError(`item assistant unreachable: ${path}`, { cause });
  }

  if (!res.ok) {
    throw new InventoryDbError(
      `item assistant returned ${res.status} for ${path}`,
    );
  }

  try {
    return await res.json();
  } catch (cause) {
    throw new InventoryDbError(
      `item assistant sent malformed JSON for ${path}`,
      { cause },
    );
  }
}

/** [{ id, name, last_seen }] */
export const getCharacters = () => request("/characters");

/** [{ slot, item_id, item_high_id, ql, container_name, parent_type, parent_instance }] */
export const getCharacterItems = (characterId) =>
  request(`/character/items?characterId=${characterId}`);

/** [{ type, instance, name, parent_type, parent_instance, parent_slot }] */
export const getCharacterContainers = (characterId) =>
  request(`/character/containers?characterId=${characterId}`);
