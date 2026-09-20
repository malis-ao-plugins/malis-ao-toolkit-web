import { Section2003 } from "./ctext";

/**
 * The game's stat table, in the two shapes the app actually wants it.
 *
 * Section2003 is a raw id -> name map straight out of the client strings.
 * Both filter type-aheads were building the same 2000-entry array from it at
 * module load, and three places were spelling out the same "or the raw id"
 * fallback.
 */

/** Every named stat, ready for a type-ahead. */
export const ALL_STATS = Object.entries(Section2003).map(([id, name]) => ({
  id: Number(id),
  name,
}));

/** A stat's name, or the raw id when the table has none for it. */
export const statName = (id) => Section2003[id] ?? `Stat ${id}`;
