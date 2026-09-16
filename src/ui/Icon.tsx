type Name =
  | "utensils"
  | "search"
  | "close"
  | "arrow"
  | "check"
  | "calendar"
  | "sun"
  | "moon";
const paths: Record<Name, string> = {
  utensils: "M4 3v6a3 3 0 0 0 6 0V3M7 3v18M18 3c-4 4-4 10 0 10h2M20 3v18",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "M6 6l12 12M18 6L6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12l4 4L19 6",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
};
export function Icon({ name }: { name: Name }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
