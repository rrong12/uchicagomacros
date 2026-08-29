import type { MenuItem } from "./types";

export type SortField = "calories" | "protein_g" | "fat_g" | "carbs_g";
export type SortDirection = "asc" | "desc";

export interface FilterOptions {
  minProtein?: number;
  maxCalories?: number;
  completeOnly?: boolean;
}

/**
 * Sort by a macro. Items with an unknown (null) value always sort last,
 * in both directions — "unknown" is not "zero" and not "huge".
 */
export function sortItems(
  items: readonly MenuItem[],
  field: SortField,
  direction: SortDirection = "desc"
): MenuItem[] {
  return [...items].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return direction === "desc" ? bv - av : av - bv;
  });
}

/**
 * Filter by macro thresholds. An item whose value for a filtered field is
 * unknown is excluded — we cannot assert it satisfies the threshold.
 */
export function filterItems(
  items: readonly MenuItem[],
  opts: FilterOptions
): MenuItem[] {
  return items.filter((i) => {
    if (opts.completeOnly && !i.macrosComplete) return false;
    if (opts.minProtein !== undefined) {
      if (i.protein_g === null || i.protein_g < opts.minProtein) return false;
    }
    if (opts.maxCalories !== undefined) {
      if (i.calories === null || i.calories > opts.maxCalories) return false;
    }
    return true;
  });
}
