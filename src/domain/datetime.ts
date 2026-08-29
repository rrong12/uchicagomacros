/**
 * Today's date in America/Chicago as YYYY-MM-DD.
 * The en-CA locale formats dates as YYYY-MM-DD, which is exactly what the API wants.
 */
export function chicagoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** e.g. "Saturday, August 29" in campus local time. */
export function displayDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

/**
 * Which meal is being served right now, by the clock.
 *
 * The API gives no serving times — a `periods` response lists only id,
 * sort_order, and name, and always returns `sort_order: 0` (Breakfast) as the
 * default regardless of when you ask. So the current meal has to be inferred
 * from campus local time.
 */
export function currentPeriodName(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  return "Dinner";
}
