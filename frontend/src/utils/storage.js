const KEY = 'tryonbd:demo:v1';
export function loadState(seed) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || saved.version !== 1) return seed;
    return Object.fromEntries(
      Object.entries(seed).map(([key, fallback]) => [
        key,
        Array.isArray(fallback)
          ? Array.isArray(saved.data?.[key])
            ? saved.data[key]
            : fallback
          : { ...fallback, ...saved.data?.[key] },
      ]),
    );
  } catch {
    return seed;
  }
}
export function saveState(state) {
  // Image binaries and temporary browser URLs stay in memory, never in localStorage.
  const json = JSON.stringify({ version: 1, data: state }, (key, value) => {
    if (/password/i.test(key)) return undefined;
    if (typeof value === 'string' && /^(data:|blob:)/i.test(value)) return '';
    return value;
  });
  try {
    localStorage.setItem(KEY, json);
    return true;
  } catch {
    return false;
  }
}
