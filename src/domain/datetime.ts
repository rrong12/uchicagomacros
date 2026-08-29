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
