/**
 * The inventory search box, read as words and filters.
 *
 *   wrist pad ql:200+ loc:bank char:aag -broken
 *
 * Plain words go to the item database as the name, which already matches
 * loosely (initials, word starts, punctuation ignored). Everything else
 * filters the copies found, using what only the inventory knows:
 *
 *   ql:200       exactly 200          ql:100-200   from 100 to 200
 *   ql:200+      200 or more          ql:200-      200 or less
 *   ql:>200      over 200             ql:<200      under 200 (>= and <= too)
 *   id:…         the item id, with the same forms as ql
 *   loc:bank     location or the container it sits in contains "bank"
 *                (in: is the same)
 *   char:aag     character name contains "aag"
 *   -word        name does not contain "word"
 *   -loc:bank    not in the bank; -char: likewise
 *   "a b"        quotes keep words together, for a value or a name
 *
 * A key the search does not know stays part of the name, so a name with a
 * colon in it still finds itself. A filter repeated narrows further.
 */

const RANGE_KEYS = { ql: "ql", id: "id" };
const TEXT_KEYS = { loc: "loc", in: "loc", char: "char" };

/** Split on spaces, keeping quoted runs (and quoted filter values) whole. */
function tokenize(text) {
  const tokens = [];
  const pattern = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi;
  let match;
  while ((match = pattern.exec(text))) {
    const [, minus, key, quoted, plain] = match;
    tokens.push({ minus: !!minus, key: key?.toLowerCase(), value: quoted ?? plain ?? "" });
  }
  return tokens;
}

/**
 * A number range from one filter value, or null when it does not read as
 * one. Both ends are inclusive.
 */
export function parseRange(value) {
  const v = value.replace(/\s+/g, "");
  let m;

  if ((m = /^(\d+)$/.exec(v))) return { min: +m[1], max: +m[1] };
  if ((m = /^(\d+)-(\d+)$/.exec(v))) {
    const [a, b] = [+m[1], +m[2]];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  if ((m = /^(\d+)\+$/.exec(v))) return { min: +m[1], max: Infinity };
  if ((m = /^(\d+)-$/.exec(v))) return { min: -Infinity, max: +m[1] };
  if ((m = /^>=(\d+)$/.exec(v))) return { min: +m[1], max: Infinity };
  if ((m = /^<=(\d+)$/.exec(v))) return { min: -Infinity, max: +m[1] };
  if ((m = /^>(\d+)$/.exec(v))) return { min: +m[1] + 1, max: Infinity };
  if ((m = /^<(\d+)$/.exec(v))) return { min: -Infinity, max: +m[1] - 1 };
  return null;
}

/**
 * The search box as { name, ql, id, loc, char, exclude }: the name for the
 * database, and the filters for the rows.
 */
export function parseQuery(text = "") {
  const query = {
    name: "",
    ql: [],
    id: [],
    loc: [],
    char: [],
    notLoc: [],
    notChar: [],
    exclude: [],
  };
  const words = [];

  for (const { minus, key, value } of tokenize(text)) {
    if (!value) continue;

    const range = RANGE_KEYS[key];
    if (range && !minus) {
      const parsed = parseRange(value);
      if (parsed) {
        query[range].push(parsed);
        continue;
      }
    }

    const field = TEXT_KEYS[key];
    if (field) {
      const list = minus ? `not${field[0].toUpperCase()}${field.slice(1)}` : field;
      query[list].push(value.toLowerCase());
      continue;
    }

    // Unknown keys, and values that did not parse, are part of the name.
    const word = key ? `${key}:${value}` : value;
    if (minus && !key) query.exclude.push(value.toLowerCase());
    else words.push(minus ? `-${word}` : word);
  }

  query.name = words.join(" ");
  return query;
}

const inRange = (n, { min, max }) => n >= min && n <= max;

/** Whether a query has anything beyond the name. */
export const hasFilters = (q) =>
  ["ql", "id", "loc", "char", "notLoc", "notChar", "exclude"].some(
    (k) => q[k].length > 0,
  );

/**
 * Whether one result row passes the query's filters. A row is one physical
 * copy: { name, ql, low_id, members, locationName, locationParent, charName }.
 */
export function matchesFilters(row, q) {
  if (!q.ql.every((r) => inRange(row.ql, r))) return false;

  if (q.id.length) {
    const ids = [row.low_id, row.high_id, ...(row.members ?? []).map((m) => m.id)]
      .filter((x) => x != null);
    if (!q.id.every((r) => ids.some((id) => inRange(id, r)))) return false;
  }

  const where = `${row.locationName ?? ""} ${row.locationParent ?? ""}`.toLowerCase();
  if (!q.loc.every((l) => where.includes(l))) return false;
  if (q.notLoc.some((l) => where.includes(l))) return false;

  const who = (row.charName ?? "").toLowerCase();
  if (!q.char.every((c) => who.includes(c))) return false;
  if (q.notChar.some((c) => who.includes(c))) return false;

  if (q.exclude.length) {
    const name = (row.name ?? "").toLowerCase();
    if (q.exclude.some((w) => name.includes(w))) return false;
  }

  return true;
}
