import type { MenuItem } from "./types";

/** Canonical macro fields on MenuItem that a nutrient can populate. */
export type NutrientField =
  | "calories"
  | "protein_g"
  | "fat_g"
  | "carbs_g"
  | "sugar_g"
  | "fiber_g"
  | "sodium_mg";

/**
 * v1 returns nutrients[].id as "", so the only way to identify a nutrient
 * is its display name. Any name absent from this map is logged, not dropped
 * silently, so upstream renames surface instead of degrading results quietly.
 */
export const NUTRIENT_FIELDS: Record<string, NutrientField> = {
  "Calories": "calories",
  "Protein (g)": "protein_g",
  "Total Fat (g)": "fat_g",
  "Total Carbohydrates (g)": "carbs_g",
  "Sugar (g)": "sugar_g",
  "Dietary Fiber (g)": "fiber_g",
  "Sodium (mg)": "sodium_mg",
};

/**
 * Parse a v1 nutrient value. Always read `value_numeric`, never `value` —
 * `value` may be prose such as "less than 1 gram".
 * Missing or unparseable returns null, which means "unknown", not zero.
 */
export function parseNutrientValue(
  raw: string | null | undefined
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Nutrient names the API returns that we deliberately don't model.
 * Listed explicitly so the "unrecognized nutrient" warning stays meaningful —
 * it should fire for names we've never seen, not for ones we chose to skip.
 */
export const KNOWN_UNMAPPED: ReadonlySet<string> = new Set([
  "Cholesterol (mg)",
  "Potassium (mg)",
  "Calcium (mg)",
  "Iron (mg)",
  "Vitamin D (IU)",
  "Vitamin C (mg)",
  "Vitamin A (RE)",
  "Calories From Fat",
]);

/** True when every macro we sort and filter on is present. */
export function hasCompleteMacros(item: Pick<
  MenuItem,
  "calories" | "protein_g" | "fat_g" | "carbs_g"
>): boolean {
  return (
    item.calories !== null &&
    item.protein_g !== null &&
    item.fat_g !== null &&
    item.carbs_g !== null
  );
}
