import type { Hall } from "./types";

/**
 * Location IDs confirmed working against the v1 API on 2026-08-29.
 * The API does not return hall names, so they are hardcoded here.
 */
export const HALLS: readonly Hall[] = [
  { id: "618a6caab63f1e2d4442bdf5", name: "Baker" },
  { id: "618a6efbb63f1e2d444389c1", name: "Cathey" },
  { id: "618a6df9b63f1e2d692b1f5c", name: "Woodlawn" },
  { id: "618a6f95b63f1e2d3b454065", name: "Bartlett" },
] as const;
