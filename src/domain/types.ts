/** A macro value. `null` means the API did not report it — NOT zero. */
export type Macro = number | null;

export interface Hall {
  id: string;
  name: string;
}

/** One allergen tag the dining hall published for a dish. */
export interface Allergen {
  /** Name with any trailing `*` stripped: "Milk*" becomes "Milk". */
  name: string;
  /**
   * True when the API starred the name. **The meaning is unconfirmed** — read
   * it as "may contain". Never use it, or the absence of a tag, to assert that
   * a dish is free of an allergen. See spec §2.7.
   */
  trace: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  portion: string;
  ingredients: string;
  category: string;
  /**
   * Dietary labels the hall published — "Vegetarian", "Vegan", "Avoiding
   * Gluten". Empty when none; we cannot distinguish "no labels" from "labels
   * not reported", so we do not model that difference.
   */
  labels: string[];
  /** Allergen tags, in API order. Absence of a tag is NOT a claim of absence. */
  allergens: Allergen[];
  calories: Macro;
  protein_g: Macro;
  fat_g: Macro;
  carbs_g: Macro;
  sugar_g: Macro;
  fiber_g: Macro;
  sodium_mg: Macro;
  /** True when calories, protein, fat, and carbs are all present. */
  macrosComplete: boolean;
}

export interface PeriodSummary {
  id: string;
  name: string;
}

export interface PeriodMenu {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface HallDay {
  hall: Hall;
  date: string;
  closed: boolean;
  /** Every period available that day, for the switcher. Empty when closed. */
  periods: PeriodSummary[];
  /**
   * Full item detail for each period we've fetched.
   *
   * A single `periods` request returns only ONE period's items — always the
   * one with `sort_order: 0`, regardless of the time of day. Other periods
   * require a separate request each, so this may hold fewer entries than
   * `periods` lists.
   */
  menus: PeriodMenu[];
}

/** Find a fetched period's menu by name. Returns null if not fetched or absent. */
export function menuFor(day: HallDay, periodName: string): PeriodMenu | null {
  return day.menus.find((m) => m.name === periodName) ?? null;
}
