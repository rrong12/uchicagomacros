/** A macro value. `null` means the API did not report it — NOT zero. */
export type Macro = number | null;

export interface Hall {
  id: string;
  name: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  portion: string;
  ingredients: string;
  category: string;
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
  /** Every period available that day. Empty when closed. */
  periods: PeriodSummary[];
  /** The period the API returned in full. Null when closed. */
  currentPeriod: PeriodMenu | null;
}
