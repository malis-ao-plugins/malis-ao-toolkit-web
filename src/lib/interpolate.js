// interpolate.js
export const lerp = (low, high, ql, lowQl, highQl) => {
  ql = Math.floor(ql);
  if (ql === lowQl) return low;
  if (ql === highQl) return high;
  return Math.round(low + (ql - lowQl) * (high - low) / (highQl - lowQl));
};

export const interpolateMods = (lowMods, highMods, ql, lowQl, highQl) => {
  const highMap = Object.fromEntries(
    highMods.map(r => [`${r.event_type}_${r.function_type}_${r.list_index}_${r.operator}`, r])
  );

  return lowMods.map(r => {
    if (r.value_type !== "num" || r.value == null) return r;
    const key = `${r.event_type}_${r.function_type}_${r.list_index}_${r.operator}`;
    const high = highMap[key];
    if (!high) return r;
    return { ...r, value: lerp(r.value, high.value, ql, lowQl, highQl) };
  });
};

export const interpolateReqs = (lowReqs, highReqs, ql, lowQl, highQl) => {
  return lowReqs.map((r, i) => {
    const high = highReqs[i];
    if (!high || r.value == null) return r;
    return { ...r, value: lerp(r.value, high.value, ql, lowQl, highQl) };
  });
};

  export const interpolateStats = (lowStats, highStats, ql, lowQl, highQl) => {
  const highMap = Object.fromEntries(highStats.map(r => [r.stat_id, r]));
  return lowStats.map(r => {
    const high = highMap[r.stat_id];
    if (!high || r.value == null) return r;
    return { ...r, value: lerp(r.value, high.value, ql, lowQl, highQl) };
  });
};