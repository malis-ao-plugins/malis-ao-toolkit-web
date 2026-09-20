/**
 * QL interpolation.
 *
 * An item family is stored as a handful of templates at fixed QLs; a QL in
 * between is rendered by interpolating each value between the two templates
 * that bracket it.
 *
 * The rows of the two templates have to be paired up before any of that can
 * happen, and they are paired by identity rather than by position. The two
 * templates describe the same item, but nothing guarantees the service
 * returns their rows in the same order or in equal numbers — requirements
 * used to be paired by array index, so one extra or reordered row meant
 * every value after it was interpolated against the wrong requirement, and
 * the tooltip quietly showed a number the item does not have.
 */

/** Interpolate one value, on whole numbers, with the endpoints exact. */
export const lerp = (low, high, ql, lowQl, highQl) => {
  ql = Math.floor(ql);
  if (ql === lowQl) return low;
  if (ql === highQl) return high;
  return Math.round(low + ((ql - lowQl) * (high - low)) / (highQl - lowQl));
};

/**
 * Index the high template's rows by key, returning a function that takes the
 * next unclaimed match for a row.
 *
 * Rows sharing a key are handed out in the order they appear, so a genuine
 * repeat — the same stat under two operators, say — stays paired with its
 * own counterpart instead of every repeat collapsing onto the last one.
 */
function matcher(highRows, keyOf) {
  const queues = new Map();

  // Not just null: a service answering the wrong shape entirely — an object
  // where rows were expected — should cost a tooltip its interpolation, not
  // throw out of a hover.
  for (const row of Array.isArray(highRows) ? highRows : []) {
    const key = keyOf(row);
    const queue = queues.get(key);
    if (queue) queue.push(row);
    else queues.set(key, [row]);
  }

  return (row) => queues.get(keyOf(row))?.shift();
}

/**
 * Walk the low template, interpolating each row against its counterpart.
 *
 * A row with no counterpart, no value, or a value that is not a number is
 * passed through untouched — a missing high template is a reason to show the
 * low value, never a reason to fail.
 */
function interpolateRows(lowRows, highRows, ql, lowQl, highQl, keyOf, numeric) {
  const take = matcher(highRows, keyOf);

  return (Array.isArray(lowRows) ? lowRows : []).map((row) => {
    // Claimed even when it cannot be used, so that later rows sharing the
    // key still line up with the right counterpart.
    const high = take(row);

    if (row.value == null) return row;
    if (numeric && !numeric(row)) return row;
    if (!high || high.value == null) return row;

    return { ...row, value: lerp(row.value, high.value, ql, lowQl, highQl) };
  });
}

const modKey = (r) =>
  `${r.event_type}|${r.function_type}|${r.list_index}|${r.operator}`;

// Requirements have no id of their own. What identifies one is the action it
// belongs to, the stat it reads and the comparison it makes.
const reqKey = (r) => `${r.outer_action_type ?? 0}|${r.stat}|${r.operator}`;

const statKey = (r) => String(r.stat_id);

export const interpolateMods = (lowMods, highMods, ql, lowQl, highQl) =>
  interpolateRows(
    lowMods,
    highMods,
    ql,
    lowQl,
    highQl,
    modKey,
    (r) => r.value_type === "num",
  );

export const interpolateReqs = (lowReqs, highReqs, ql, lowQl, highQl) =>
  interpolateRows(lowReqs, highReqs, ql, lowQl, highQl, reqKey);

export const interpolateStats = (lowStats, highStats, ql, lowQl, highQl) =>
  interpolateRows(lowStats, highStats, ql, lowQl, highQl, statKey);
