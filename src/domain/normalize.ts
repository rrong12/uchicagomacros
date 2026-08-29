import type { Hall, HallDay, MenuItem, PeriodMenu, PeriodSummary } from "./types";
import {
  NUTRIENT_FIELDS,
  KNOWN_UNMAPPED,
  parseNutrientValue,
  hasCompleteMacros,
} from "./nutrients";

/** Nutrient names already reported as unknown, so we log each one once. */
const warned = new Set<string>();

interface RawNutrient {
  name?: string;
  value_numeric?: string | null;
}

interface RawItem {
  id?: string;
  name?: string;
  desc?: string;
  portion?: string;
  ingredients?: string;
  nutrients?: RawNutrient[];
}

interface RawCategory {
  id?: string;
  name?: string;
  items?: RawItem[];
}

interface RawPeriod {
  id?: string;
  name?: string;
  categories?: RawCategory[];
}

export interface RawResponse {
  closed?: boolean;
  menu?: { date?: string; periods?: RawPeriod } | null;
  periods?: Array<{ id?: string; name?: string }> | null;
}

function normalizeItem(raw: RawItem, category: string): MenuItem {
  const macros = {
    calories: null as number | null,
    protein_g: null as number | null,
    fat_g: null as number | null,
    carbs_g: null as number | null,
    sugar_g: null as number | null,
    fiber_g: null as number | null,
    sodium_mg: null as number | null,
  };

  for (const n of raw.nutrients ?? []) {
    const name = n.name ?? "";
    const field = NUTRIENT_FIELDS[name];
    if (!field) {
      if (name && !KNOWN_UNMAPPED.has(name) && !warned.has(name)) {
        warned.add(name);
        console.warn(`[normalize] unrecognized nutrient name: "${name}"`);
      }
      continue;
    }
    macros[field] = parseNutrientValue(n.value_numeric);
  }

  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    description: raw.desc ?? "",
    portion: raw.portion ?? "",
    ingredients: raw.ingredients ?? "",
    category,
    ...macros,
    macrosComplete: hasCompleteMacros(macros),
  };
}

function normalizePeriod(raw: RawPeriod): PeriodMenu {
  const items: MenuItem[] = [];
  for (const cat of raw.categories ?? []) {
    const categoryName = cat.name ?? "Other";
    for (const item of cat.items ?? []) {
      items.push(normalizeItem(item, categoryName));
    }
  }
  return { id: raw.id ?? "", name: raw.name ?? "", items };
}

/**
 * Convert a raw v1 `periods` response into a HallDay.
 *
 * Structural quirks of v1 this handles:
 *  - top-level `periods` is the LIST of available periods
 *  - `menu.periods` is a SINGLE object holding the full detail of one period
 *  - when a hall is closed, `menu` and `periods` are absent entirely
 */
export function normalizeHallDay(
  hall: Hall,
  raw: RawResponse,
  fallbackDate = ""
): HallDay {
  const closed = raw.closed === true;

  if (closed || !raw.menu) {
    return {
      hall,
      date: raw.menu?.date ?? fallbackDate,
      closed: true,
      periods: [],
      currentPeriod: null,
    };
  }

  const periods: PeriodSummary[] = (raw.periods ?? []).map((p) => ({
    id: p.id ?? "",
    name: p.name ?? "",
  }));

  const current = raw.menu.periods ? normalizePeriod(raw.menu.periods) : null;

  return {
    hall,
    date: raw.menu.date ?? fallbackDate,
    closed: false,
    periods,
    currentPeriod: current,
  };
}
