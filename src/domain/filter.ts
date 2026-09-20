import type { MenuItem } from "./types";

export type SortField = "calories" | "protein_g" | "fat_g" | "carbs_g";
export type SortDirection = "asc" | "desc";

export interface FilterOptions {
  minProtein?: number;
  maxCalories?: number;
  completeOnly?: boolean;
  /**
   * Dietary labels the dish must carry — ALL of them, not any. Selecting Vegan
   * and Avoiding Gluten means both: a user narrowing a menu wants the
   * intersection. Empty or absent means no label filtering.
   */
  labels?: string[];
}

/**
 * True when the item carries every one of `labels`.
 *
 * Matched exactly, not case-insensitively. The names come from a fixed vendor
 * vocabulary and are echoed straight back into the UI's chips, so a mismatch
 * cannot come from user input — only from an upstream rename, which we want to
 * surface rather than paper over.
 */
export function hasLabels(item: MenuItem, labels: readonly string[]): boolean {
  return labels.every((l) => item.labels.includes(l));
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
    if (opts.labels?.length && !hasLabels(i, opts.labels)) return false;
    if (opts.minProtein !== undefined) {
      if (i.protein_g === null || i.protein_g < opts.minProtein) return false;
    }
    if (opts.maxCalories !== undefined) {
      if (i.calories === null || i.calories > opts.maxCalories) return false;
    }
    return true;
  });
}
