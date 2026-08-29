const BASE = "https://api.dineoncampus.com/v1";

/**
 * Fetch a hall's periods for a date.
 *
 * MUST run in the browser. The v1 host returns 403 to any server-side client
 * (Cloudflare), so this cannot be called from SSR, an edge function, or a
 * Node script. See spec §2.2.
 */
export async function fetchPeriods(
  locationId: string,
  date: string
): Promise<unknown> {
  const url = `${BASE}/location/${locationId}/periods?platform=0&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DineOnCampus ${res.status} for ${locationId} on ${date}`);
  }
  return res.json();
}
