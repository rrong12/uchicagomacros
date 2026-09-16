import { useState } from "react";
import type { MenuItem } from "../domain/types";
export type PlateItem = Pick<
  MenuItem,
  | "id"
  | "name"
  | "portion"
  | "category"
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
>;
export interface PlateEntry {
  item: PlateItem;
  servings: number;
}
type Plates = Record<string, PlateEntry[]>;
const STORAGE_KEY = "uchicagomacros:plates:v1";
const macroKeys = ["calories", "protein_g", "carbs_g", "fat_g"] as const;
export function itemKey(item: PlateItem) {
  return JSON.stringify([item.id, item.name, item.category]);
}
function read(): Plates {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const valid: Plates = {};
    for (const [key, entries] of Object.entries(value)) {
      if (!Array.isArray(entries) || entries.length > 200) continue;
      if (
        entries.every(
          (e) =>
            e &&
            typeof e === "object" &&
            Number.isFinite(e.servings) &&
            e.servings >= 0.5 &&
            e.servings <= 20 &&
            (e.servings * 2) % 1 === 0 &&
            e.item &&
            ["id", "name", "portion", "category"].every(
              (k) => typeof e.item[k] === "string",
            ) &&
            macroKeys.every(
              (k) =>
                e.item[k] === null ||
                (typeof e.item[k] === "number" &&
                  Number.isFinite(e.item[k]) &&
                  e.item[k] >= 0),
            ),
        )
      )
        valid[key] = entries;
    }
    return valid;
  } catch {
    return {};
  }
}
export function usePlate(key: string) {
  const [plates, setPlates] = useState<Plates>(read);
  const [saveError, setSaveError] = useState(false);
  const entries = plates[key] ?? [];
  function update(next: PlateEntry[]) {
    const updated = { ...plates, [key]: next };
    setPlates(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }
  return {
    entries,
    saveError,
    add(item: MenuItem) {
      const existing = entries.find((e) => itemKey(e.item) === itemKey(item));
      const snapshot: PlateItem = {
        id: item.id,
        name: item.name,
        portion: item.portion,
        category: item.category,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
      };
      update(
        existing
          ? entries.map((e) =>
              e === existing
                ? { item: snapshot, servings: Math.min(20, e.servings + 1) }
                : e,
            )
          : [...entries, { item: snapshot, servings: 1 }],
      );
    },
    change(id: string, delta: number) {
      update(
        entries.map((e) =>
          itemKey(e.item) === id
            ? {
                ...e,
                servings: Math.max(0.5, Math.min(20, e.servings + delta)),
              }
            : e,
        ),
      );
    },
    remove(id: string) {
      update(entries.filter((e) => itemKey(e.item) !== id));
    },
    clear() {
      update([]);
    },
  };
}
