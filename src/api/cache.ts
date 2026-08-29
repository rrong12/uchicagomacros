const PREFIX = "menu:";

export function cacheKey(locationId: string, date: string): string {
  return `${PREFIX}${locationId}:${date}`;
}

/** Read a cached response. Returns null on miss, corrupt data, or no storage. */
export function readCache(locationId: string, date: string): unknown | null {
  try {
    const raw = localStorage.getItem(cacheKey(locationId, date));
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Write a response. Silently no-ops if storage is unavailable or full. */
export function writeCache(
  locationId: string,
  date: string,
  value: unknown
): void {
  try {
    localStorage.setItem(cacheKey(locationId, date), JSON.stringify(value));
  } catch {
    /* private mode or quota exceeded — caching is an optimisation, not a requirement */
  }
}

/** Drop cached menus for any date before `today`. Menus for a past date are useless. */
export function evictStale(today: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const date = key.slice(key.lastIndexOf(":") + 1);
      if (date < today) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* no storage — nothing to evict */
  }
}
