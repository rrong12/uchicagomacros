import { useState } from "react";
import type { MacroTargets } from "../domain/plate";

/**
 * Targets live under their own key rather than inside the plate store.
 * A protein goal is a property of the person, not of a hall and meal, and
 * `usePlate` has a validating reader that would reject a widened shape.
 */
const STORAGE_KEY = "uchicagomacros:targets:v1";

/** A day's worth of a plausible single meal, not medical advice. */
export const DEFAULT_TARGETS: MacroTargets = {
  calories: 800,
  protein_g: 40,
  carbs_g: 90,
  fat_g: 25,
};

export const TARGET_FIELDS = [
  ["calories", "Calories", "kcal", 5000],
  ["protein_g", "Protein", "g", 500],
  ["carbs_g", "Carbs", "g", 800],
  ["fat_g", "Fat", "g", 400],
] as const;

function read(): MacroTargets {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return DEFAULT_TARGETS;
    }
    const parsed = {} as MacroTargets;
    for (const [key, , , max] of TARGET_FIELDS) {
      const raw = (value as Record<string, unknown>)[key];
      // A stored target outside the accepted range is not repaired field by
      // field — a partially trusted set of targets is worse than the default.
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return DEFAULT_TARGETS;
      }
      if (raw < 0 || raw > max) return DEFAULT_TARGETS;
      parsed[key] = raw;
    }
    return parsed;
  } catch {
    return DEFAULT_TARGETS;
  }
}

export function useTargets() {
  const [targets, setTargets] = useState<MacroTargets>(read);

  return {
    targets,
    set(key: keyof MacroTargets, value: number) {
      const next = { ...targets, [key]: value };
      setTargets(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Targets that do not persist are still usable for this visit. The
        // plate panel already warns when this browser cannot save.
      }
    },
  };
}
