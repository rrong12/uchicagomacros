# UChicagoMacros M1 — Menu Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, mobile-first web app showing today's menus across UChicago's four dining commons, with sorting and filtering by calories, protein, fat, and carbs.

**Architecture:** Pure client-side SPA. The browser fetches directly from the legacy DineOnCampus v1 API — no backend, because every server-side route is Cloudflare-blocked (spec §2.2). Pure domain logic (`normalize`, `filter`, `datetime`) is isolated from React and network I/O so it can be unit-tested against captured fixtures.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, plain CSS. Deployed as static assets on Vercel.

**Spec:** `docs/superpowers/specs/2026-08-29-dining-menu-app-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/types.ts` | All shared types. No logic. |
| `src/domain/halls.ts` | The four hardcoded halls. Constants only. |
| `src/domain/datetime.ts` | Chicago-local date. Pure. |
| `src/domain/nutrients.ts` | Nutrient name → canonical field, value parsing. Pure. |
| `src/domain/normalize.ts` | Raw v1 JSON → `HallDay`. Pure. Depends on `nutrients`. |
| `src/domain/filter.ts` | Sorting and filtering `MenuItem[]`. Pure. |
| `src/api/client.ts` | HTTP to v1. Knows URLs, nothing about food. |
| `src/api/cache.ts` | localStorage read/write. Knows nothing about food. |
| `src/state/useMenus.ts` | React hook. Orchestrates client + cache + normalize. |
| `src/ui/FilterBar.tsx` | Sort/filter controls. |
| `src/ui/ItemRow.tsx` | One menu item. |
| `src/ui/HallCard.tsx` | One hall: open with items, or closed. |
| `src/App.tsx` | Layout, wires hook to UI. |

Nothing in `src/domain/` imports React or calls `fetch`. That is what makes it testable.

---

## Task 1: Capture fixtures (do this FIRST — time-sensitive)

Every later task tests against real captured responses. **Baker is the only hall currently serving.** Menus change daily, so capture today.

**Files:**
- Create: `tests/fixtures/baker-open.json`
- Create: `tests/fixtures/cathey-closed.json`

- [ ] **Step 1: Create the fixtures directory**

```bash
mkdir -p tests/fixtures
```

- [ ] **Step 2: Capture the open hall**

In Chrome, go to `https://example.com`, open DevTools (Cmd+Option+I) → Console, paste and run:

```js
fetch("https://api.dineoncampus.com/v1/location/618a6caab63f1e2d4442bdf5/periods?platform=0&date=2026-08-29")
  .then(r => r.json())
  .then(d => {
    const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "baker-open.json";
    a.click();
  });
```

This downloads the file directly — no clipboard needed. Move it to `tests/fixtures/baker-open.json`.

- [ ] **Step 3: Capture a closed hall**

Same place, same method, different ID and filename:

```js
fetch("https://api.dineoncampus.com/v1/location/618a6efbb63f1e2d444389c1/periods?platform=0&date=2026-08-29")
  .then(r => r.json())
  .then(d => {
    const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "cathey-closed.json";
    a.click();
  });
```

Move to `tests/fixtures/cathey-closed.json`.

- [ ] **Step 4: Verify both files are real**

```bash
node -e "const d=require('./tests/fixtures/baker-open.json'); console.log('closed:', d.closed, '| period:', d.menu.periods.name, '| categories:', d.menu.periods.categories.length)"
node -e "const d=require('./tests/fixtures/cathey-closed.json'); console.log('closed:', d.closed)"
```

Expected: first prints `closed: false` with a period name and a category count ≥ 1. Second prints `closed: true`.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures
git commit -m "test: capture real v1 API fixtures for open and closed halls"
```

---

## Task 2: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Scaffold Vite**

```bash
npm create vite@latest . -- --template react-ts
```

If it warns the directory isn't empty, choose to continue without overwriting — `docs/`, `tests/`, and `.git` must survive.

- [ ] **Step 2: Install dependencies including Vitest**

```bash
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Add the test config to `vite.config.ts`**

Replace the file with:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 4: Add a test script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify the toolchain runs**

```bash
npm run build && npm run test
```

Expected: build succeeds. `vitest run` reports "No test files found" and exits 1 — that is fine at this stage.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript + Vitest"
```

---

## Task 3: Domain types and hall constants

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/halls.ts`

- [ ] **Step 1: Write the types**

Create `src/domain/types.ts`:

```ts
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
```

- [ ] **Step 2: Write the hall constants**

Create `src/domain/halls.ts`:

```ts
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
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts src/domain/halls.ts
git commit -m "feat: add domain types and hall constants"
```

---

## Task 4: Chicago-local date

The `date` query parameter must be today **in campus time**, never the device's timezone.

**Files:**
- Create: `src/domain/datetime.ts`
- Test: `tests/datetime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/datetime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chicagoDate } from "../src/domain/datetime";

describe("chicagoDate", () => {
  it("formats as YYYY-MM-DD", () => {
    const d = chicagoDate(new Date("2026-08-29T17:00:00Z"));
    expect(d).toBe("2026-08-29");
  });

  it("uses Chicago time, not UTC", () => {
    // 02:00 UTC on the 30th is 21:00 on the 29th in Chicago.
    const d = chicagoDate(new Date("2026-08-30T02:00:00Z"));
    expect(d).toBe("2026-08-29");
  });

  it("rolls over at Chicago midnight, not UTC midnight", () => {
    // 06:00 UTC on the 30th is 01:00 on the 30th in Chicago (CDT, UTC-5).
    const d = chicagoDate(new Date("2026-08-30T06:00:00Z"));
    expect(d).toBe("2026-08-30");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/datetime.test.ts
```

Expected: FAIL — cannot resolve `../src/domain/datetime`.

- [ ] **Step 3: Implement**

Create `src/domain/datetime.ts`:

```ts
/**
 * Today's date in America/Chicago as YYYY-MM-DD.
 * The en-CA locale formats dates as YYYY-MM-DD, which is exactly what the API wants.
 */
export function chicagoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/datetime.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/datetime.ts tests/datetime.test.ts
git commit -m "feat: add Chicago-local date helper"
```

---

## Task 5: Nutrient parsing

The single most failure-prone piece. `value` may contain prose (`"less than 1 gram"`), `value_numeric` is a string, and `id` is `""` so nutrients can only be matched by name.

**Files:**
- Create: `src/domain/nutrients.ts`
- Test: `tests/nutrients.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/nutrients.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseNutrientValue, NUTRIENT_FIELDS } from "../src/domain/nutrients";

describe("parseNutrientValue", () => {
  it("parses a numeric string", () => {
    expect(parseNutrientValue("14")).toBe(14);
  });

  it("parses a decimal", () => {
    expect(parseNutrientValue("2.5")).toBe(2.5);
  });

  it("returns null for an empty string", () => {
    expect(parseNutrientValue("")).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(parseNutrientValue(null)).toBeNull();
    expect(parseNutrientValue(undefined)).toBeNull();
  });

  it("returns null for prose, rather than NaN or 0", () => {
    expect(parseNutrientValue("less than 1 gram")).toBeNull();
  });

  it("does not treat a missing value as zero", () => {
    expect(parseNutrientValue("")).not.toBe(0);
  });
});

describe("NUTRIENT_FIELDS", () => {
  it("maps the four macros we sort by", () => {
    expect(NUTRIENT_FIELDS["Calories"]).toBe("calories");
    expect(NUTRIENT_FIELDS["Protein (g)"]).toBe("protein_g");
    expect(NUTRIENT_FIELDS["Total Fat (g)"]).toBe("fat_g");
    expect(NUTRIENT_FIELDS["Total Carbohydrates (g)"]).toBe("carbs_g");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/nutrients.test.ts
```

Expected: FAIL — cannot resolve `../src/domain/nutrients`.

- [ ] **Step 3: Implement**

Create `src/domain/nutrients.ts`:

```ts
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
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/nutrients.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/nutrients.ts tests/nutrients.test.ts
git commit -m "feat: add nutrient name mapping and value parsing"
```

---

## Task 6: Normalize the v1 response

**Files:**
- Create: `src/domain/normalize.ts`
- Test: `tests/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeHallDay } from "../src/domain/normalize";
import { HALLS } from "../src/domain/halls";
import openFixture from "./fixtures/baker-open.json";
import closedFixture from "./fixtures/cathey-closed.json";

const baker = HALLS[0];
const cathey = HALLS[1];

describe("normalizeHallDay — open hall", () => {
  const day = normalizeHallDay(baker, openFixture);

  it("is not closed", () => {
    expect(day.closed).toBe(false);
  });

  it("carries the hall and date", () => {
    expect(day.hall.name).toBe("Baker");
    expect(day.date).toBe("2026-08-29");
  });

  it("lists the available periods", () => {
    expect(day.periods.length).toBeGreaterThan(0);
    expect(day.periods[0].name).toBeTruthy();
  });

  it("extracts items from the current period", () => {
    expect(day.currentPeriod).not.toBeNull();
    expect(day.currentPeriod!.items.length).toBeGreaterThan(0);
  });

  it("tags every item with its category", () => {
    for (const item of day.currentPeriod!.items) {
      expect(item.category).toBeTruthy();
    }
  });

  it("parses macros as numbers or null, never NaN", () => {
    for (const item of day.currentPeriod!.items) {
      for (const v of [item.calories, item.protein_g, item.fat_g, item.carbs_g]) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("finds calories even though v1 has no top-level calories field", () => {
    const withCalories = day.currentPeriod!.items.filter((i) => i.calories !== null);
    expect(withCalories.length).toBeGreaterThan(0);
  });
});

describe("normalizeHallDay — closed hall", () => {
  const day = normalizeHallDay(cathey, closedFixture);

  it("is closed", () => {
    expect(day.closed).toBe(true);
  });

  it("has no current period and no periods", () => {
    expect(day.currentPeriod).toBeNull();
    expect(day.periods).toEqual([]);
  });

  it("does not throw on a missing menu object", () => {
    expect(() => normalizeHallDay(cathey, closedFixture)).not.toThrow();
  });
});

describe("normalizeHallDay — malformed input", () => {
  it("treats an item with no nutrients as macros-incomplete", () => {
    const raw = {
      status: "success",
      closed: false,
      menu: {
        date: "2026-08-29",
        periods: {
          id: "p1",
          name: "Lunch",
          categories: [
            { id: "c1", name: "Grill", items: [{ id: "i1", name: "Mystery", nutrients: [] }] },
          ],
        },
      },
      periods: [{ id: "p1", name: "Lunch" }],
    };
    const day = normalizeHallDay(baker, raw);
    const item = day.currentPeriod!.items[0];
    expect(item.macrosComplete).toBe(false);
    expect(item.protein_g).toBeNull();
  });

  it("ignores an unrecognized nutrient name without crashing", () => {
    const raw = {
      status: "success",
      closed: false,
      menu: {
        date: "2026-08-29",
        periods: {
          id: "p1",
          name: "Lunch",
          categories: [
            {
              id: "c1",
              name: "Grill",
              items: [
                {
                  id: "i1",
                  name: "Thing",
                  nutrients: [
                    { id: "", name: "Vitamin Q (mg)", value: "5", value_numeric: "5" },
                    { id: "", name: "Protein (g)", value: "9", value_numeric: "9" },
                  ],
                },
              ],
            },
          ],
        },
      },
      periods: [{ id: "p1", name: "Lunch" }],
    };
    const day = normalizeHallDay(baker, raw);
    expect(day.currentPeriod!.items[0].protein_g).toBe(9);
  });
});
```

- [ ] **Step 2: Enable JSON imports in TypeScript**

In `tsconfig.json`, add to `compilerOptions`:

```json
"resolveJsonModule": true
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
npx vitest run tests/normalize.test.ts
```

Expected: FAIL — cannot resolve `../src/domain/normalize`.

- [ ] **Step 4: Implement**

Create `src/domain/normalize.ts`:

```ts
import type { Hall, HallDay, MenuItem, PeriodMenu, PeriodSummary } from "./types";
import { NUTRIENT_FIELDS, parseNutrientValue, hasCompleteMacros } from "./nutrients";

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

interface RawResponse {
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
      if (name && !warned.has(name)) {
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
 * Two structural quirks of v1 this handles:
 *  - top-level `periods` is the LIST of available periods
 *  - `menu.periods` is a SINGLE object holding the full detail of one period
 *  - when a hall is closed, `menu` may be absent entirely
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
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
npx vitest run tests/normalize.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/normalize.ts tests/normalize.test.ts tsconfig.json
git commit -m "feat: normalize v1 responses into HallDay"
```

---

## Task 7: Sorting and filtering

**Files:**
- Create: `src/domain/filter.ts`
- Test: `tests/filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortItems, filterItems } from "../src/domain/filter";
import type { MenuItem } from "../src/domain/types";

function item(over: Partial<MenuItem>): MenuItem {
  return {
    id: "x", name: "x", description: "", portion: "", ingredients: "",
    category: "Grill", calories: 100, protein_g: 10, fat_g: 5, carbs_g: 20,
    sugar_g: null, fiber_g: null, sodium_mg: null, macrosComplete: true,
    ...over,
  };
}

describe("sortItems", () => {
  const items = [
    item({ id: "a", protein_g: 5 }),
    item({ id: "b", protein_g: 30 }),
    item({ id: "c", protein_g: 12 }),
  ];

  it("sorts descending by default", () => {
    expect(sortItems(items, "protein_g", "desc").map((i) => i.id))
      .toEqual(["b", "c", "a"]);
  });

  it("sorts ascending", () => {
    expect(sortItems(items, "protein_g", "asc").map((i) => i.id))
      .toEqual(["a", "c", "b"]);
  });

  it("puts null values last regardless of direction", () => {
    const withNull = [...items, item({ id: "z", protein_g: null })];
    expect(sortItems(withNull, "protein_g", "desc").at(-1)!.id).toBe("z");
    expect(sortItems(withNull, "protein_g", "asc").at(-1)!.id).toBe("z");
  });

  it("does not mutate the input", () => {
    const original = items.map((i) => i.id);
    sortItems(items, "protein_g", "desc");
    expect(items.map((i) => i.id)).toEqual(original);
  });
});

describe("filterItems", () => {
  const items = [
    item({ id: "a", protein_g: 5, calories: 100 }),
    item({ id: "b", protein_g: 30, calories: 400 }),
    item({ id: "c", protein_g: null, calories: 200, macrosComplete: false }),
  ];

  it("returns everything when no filters are set", () => {
    expect(filterItems(items, {}).length).toBe(3);
  });

  it("applies a minimum", () => {
    expect(filterItems(items, { minProtein: 10 }).map((i) => i.id)).toEqual(["b"]);
  });

  it("applies a maximum", () => {
    expect(filterItems(items, { maxCalories: 150 }).map((i) => i.id)).toEqual(["a"]);
  });

  it("excludes items with unknown values when that field is filtered", () => {
    expect(filterItems(items, { minProtein: 0 }).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("can hide items with incomplete macros", () => {
    expect(filterItems(items, { completeOnly: true }).map((i) => i.id))
      .toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/filter.test.ts
```

Expected: FAIL — cannot resolve `../src/domain/filter`.

- [ ] **Step 3: Implement**

Create `src/domain/filter.ts`:

```ts
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
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/filter.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filter.ts tests/filter.test.ts
git commit -m "feat: add macro sorting and filtering"
```

---

## Task 8: API client and cache

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/cache.ts`
- Test: `tests/cache.test.ts`

- [ ] **Step 1: Write the API client**

Create `src/api/client.ts`:

```ts
const BASE = "https://api.dineoncampus.com/v1";

/**
 * Fetch a hall's periods for a date.
 *
 * MUST run in the browser. The v1 host returns 403 to any server-side client
 * (Cloudflare), so this cannot be called from SSR, an edge function, or a
 * Node script. See spec §2.2.
 */
export async function fetchPeriods(
  locationId: string,
  date: string
): Promise<unknown> {
  const url = `${BASE}/location/${locationId}/periods?platform=0&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DineOnCampus ${res.status} for ${locationId} on ${date}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Write the failing cache test**

Create `tests/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { cacheKey, readCache, writeCache, evictStale } from "../src/api/cache";

describe("cache", () => {
  beforeEach(() => localStorage.clear());

  it("builds a namespaced key", () => {
    expect(cacheKey("loc1", "2026-08-29")).toBe("menu:loc1:2026-08-29");
  });

  it("round-trips a value", () => {
    writeCache("loc1", "2026-08-29", { hello: "world" });
    expect(readCache("loc1", "2026-08-29")).toEqual({ hello: "world" });
  });

  it("returns null on a miss", () => {
    expect(readCache("nope", "2026-08-29")).toBeNull();
  });

  it("returns null rather than throwing on corrupt JSON", () => {
    localStorage.setItem("menu:loc1:2026-08-29", "{not json");
    expect(readCache("loc1", "2026-08-29")).toBeNull();
  });

  it("evicts entries for earlier dates but keeps today", () => {
    writeCache("loc1", "2026-08-28", { old: true });
    writeCache("loc1", "2026-08-29", { current: true });
    evictStale("2026-08-29");
    expect(readCache("loc1", "2026-08-28")).toBeNull();
    expect(readCache("loc1", "2026-08-29")).toEqual({ current: true });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run tests/cache.test.ts
```

Expected: FAIL — cannot resolve `../src/api/cache`.

- [ ] **Step 4: Implement the cache**

Create `src/api/cache.ts`:

```ts
const PREFIX = "menu:";

export function cacheKey(locationId: string, date: string): string {
  return `${PREFIX}${locationId}:${date}`;
}

/** Read a cached response. Returns null on miss, corrupt data, or no storage. */
export function readCache(locationId: string, date: string): unknown | null {
  try {
    const raw = localStorage.getItem(cacheKey(locationId, date));
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Write a response. Silently no-ops if storage is unavailable or full. */
export function writeCache(
  locationId: string,
  date: string,
  value: unknown
): void {
  try {
    localStorage.setItem(cacheKey(locationId, date), JSON.stringify(value));
  } catch {
    /* private mode or quota exceeded — caching is an optimisation, not a requirement */
  }
}

/** Drop cached menus for any date before `today`. Menus for a past date are useless. */
export function evictStale(today: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const date = key.slice(key.lastIndexOf(":") + 1);
      if (date < today) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* no storage — nothing to evict */
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx vitest run tests/cache.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/api tests/cache.test.ts
git commit -m "feat: add v1 API client and localStorage cache"
```

---

## Task 9: The useMenus hook

**Files:**
- Create: `src/state/useMenus.ts`

- [ ] **Step 1: Implement the hook**

Create `src/state/useMenus.ts`:

```ts
import { useEffect, useState } from "react";
import { HALLS } from "../domain/halls";
import { chicagoDate } from "../domain/datetime";
import { normalizeHallDay } from "../domain/normalize";
import type { HallDay } from "../domain/types";
import { fetchPeriods } from "../api/client";
import { readCache, writeCache, evictStale } from "../api/cache";

export interface MenusState {
  days: HallDay[];
  loading: boolean;
  error: string | null;
  date: string;
}

export function useMenus(): MenusState {
  const [days, setDays] = useState<HallDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const date = chicagoDate();

  useEffect(() => {
    let cancelled = false;
    evictStale(date);

    async function loadOne(hall: (typeof HALLS)[number]): Promise<HallDay> {
      const cached = readCache(hall.id, date);
      if (cached) return normalizeHallDay(hall, cached as never, date);
      const raw = await fetchPeriods(hall.id, date);
      writeCache(hall.id, date, raw);
      return normalizeHallDay(hall, raw as never, date);
    }

    Promise.all(HALLS.map(loadOne))
      .then((result) => {
        if (!cancelled) {
          setDays(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load menus");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  return { days, loading, error, date };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/state/useMenus.ts
git commit -m "feat: add useMenus hook orchestrating fetch, cache, and normalize"
```

---

## Task 10: UI components

**Files:**
- Create: `src/ui/ItemRow.tsx`, `src/ui/FilterBar.tsx`, `src/ui/HallCard.tsx`
- Modify: `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Write ItemRow**

Create `src/ui/ItemRow.tsx`:

```tsx
import type { MenuItem } from "../domain/types";

const fmt = (v: number | null, unit: string) =>
  v === null ? "—" : `${v}${unit}`;

export function ItemRow({ item }: { item: MenuItem }) {
  return (
    <li className="item">
      <div className="item-head">
        <span className="item-name">{item.name}</span>
        {item.portion && <span className="item-portion">{item.portion}</span>}
      </div>
      <div className="item-macros">
        <span>{fmt(item.calories, " cal")}</span>
        <span>P {fmt(item.protein_g, "g")}</span>
        <span>F {fmt(item.fat_g, "g")}</span>
        <span>C {fmt(item.carbs_g, "g")}</span>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Write FilterBar**

Create `src/ui/FilterBar.tsx`:

```tsx
import type { SortField, SortDirection } from "../domain/filter";

interface Props {
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (f: SortField) => void;
  onSortDirectionToggle: () => void;
}

const FIELDS: Array<{ value: SortField; label: string }> = [
  { value: "calories", label: "Calories" },
  { value: "protein_g", label: "Protein" },
  { value: "fat_g", label: "Fat" },
  { value: "carbs_g", label: "Carbs" },
];

export function FilterBar({
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionToggle,
}: Props) {
  return (
    <div className="filterbar">
      <div className="chips">
        {FIELDS.map((f) => (
          <button
            key={f.value}
            className={f.value === sortField ? "chip chip-active" : "chip"}
            onClick={() => onSortFieldChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <button className="chip" onClick={onSortDirectionToggle}>
        {sortDirection === "desc" ? "High → Low" : "Low → High"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write HallCard**

Create `src/ui/HallCard.tsx`:

```tsx
import type { HallDay } from "../domain/types";
import type { SortField, SortDirection } from "../domain/filter";
import { sortItems } from "../domain/filter";
import { ItemRow } from "./ItemRow";

interface Props {
  day: HallDay;
  sortField: SortField;
  sortDirection: SortDirection;
}

export function HallCard({ day, sortField, sortDirection }: Props) {
  if (day.closed) {
    return (
      <section className="hall hall-closed">
        <h2>{day.hall.name}</h2>
        <p className="closed-note">Closed today</p>
      </section>
    );
  }

  const items = day.currentPeriod
    ? sortItems(day.currentPeriod.items, sortField, sortDirection)
    : [];

  return (
    <section className="hall">
      <h2>
        {day.hall.name}
        {day.currentPeriod && (
          <span className="period">{day.currentPeriod.name}</span>
        )}
      </h2>
      {items.length === 0 ? (
        <p className="closed-note">No items listed</p>
      ) : (
        <ul className="items">
          {items.map((i) => (
            <ItemRow key={`${i.category}-${i.id}-${i.name}`} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire up App**

Replace `src/App.tsx`:

```tsx
import { useState } from "react";
import { useMenus } from "./state/useMenus";
import { FilterBar } from "./ui/FilterBar";
import { HallCard } from "./ui/HallCard";
import type { SortField, SortDirection } from "./domain/filter";
import "./index.css";

export default function App() {
  const { days, loading, error, date } = useMenus();
  const [sortField, setSortField] = useState<SortField>("protein_g");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  return (
    <main className="app">
      <header>
        <h1>UChicagoMacros</h1>
        <p className="date">{date}</p>
      </header>

      <FilterBar
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onSortDirectionToggle={() =>
          setSortDirection((d) => (d === "desc" ? "asc" : "desc"))
        }
      />

      {loading && <p className="status">Loading menus…</p>}
      {error && <p className="status status-error">{error}</p>}

      {days.map((day) => (
        <HallCard
          key={day.hall.id}
          day={day}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      ))}
    </main>
  );
}
```

- [ ] **Step 5: Add mobile-first styles**

Replace `src/index.css`:

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: #faf9f7;
  color: #1a1a1a;
}

.app { max-width: 640px; margin: 0 auto; padding: 1rem; }

header h1 { font-size: 1.4rem; margin: 0; }
.date { color: #666; font-size: 0.85rem; margin: 0.2rem 0 1rem; }

.filterbar {
  display: flex; flex-wrap: wrap; gap: 0.4rem;
  position: sticky; top: 0; background: #faf9f7;
  padding: 0.5rem 0; z-index: 1;
}
.chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.chip {
  border: 1px solid #d4d0c8; background: #fff; border-radius: 999px;
  padding: 0.35rem 0.8rem; font-size: 0.85rem; cursor: pointer;
}
.chip-active { background: #800000; color: #fff; border-color: #800000; }

.hall { margin: 1.2rem 0; }
.hall h2 {
  font-size: 1.05rem; margin: 0 0 0.5rem;
  display: flex; justify-content: space-between; align-items: baseline;
}
.period { font-size: 0.8rem; font-weight: 400; color: #666; }
.hall-closed h2 { color: #999; }
.closed-note { color: #999; font-size: 0.85rem; margin: 0; }

.items { list-style: none; padding: 0; margin: 0; }
.item { padding: 0.55rem 0; border-bottom: 1px solid #ebe8e2; }
.item-head { display: flex; justify-content: space-between; gap: 0.5rem; }
.item-name { font-size: 0.92rem; }
.item-portion { font-size: 0.75rem; color: #888; white-space: nowrap; }
.item-macros {
  display: flex; gap: 0.7rem; font-size: 0.78rem;
  color: #666; margin-top: 0.2rem;
}

.status { color: #666; font-size: 0.9rem; }
.status-error { color: #a00; }
```

- [ ] **Step 6: Run it and look at it**

```bash
npm run dev
```

Open the printed localhost URL in a browser. Expected: Baker shows items with macros; the other three show "Closed today". Tapping the sort chips reorders items.

- [ ] **Step 7: Commit**

```bash
git add src/ui src/App.tsx src/index.css
git commit -m "feat: add mobile-first menu viewer UI"
```

---

## Task 11: Full test pass and deploy

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Run the whole suite**

```bash
npm run test && npx tsc --noEmit && npm run build
```

Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 2: Add SPA routing config**

Create `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 3: Push to GitHub**

```bash
gh repo create uchicagomacros --public --source=. --remote=origin --push
```

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```

Accept the defaults. Vercel detects Vite automatically.

- [ ] **Step 5: Verify the deployed site against the real API**

Open the production URL **on a phone** and confirm: menus load, Baker shows items, closed halls render as closed, sorting works, and there are no CORS errors in the console.

This matters because it is the first time the app runs from a real origin rather than localhost — the whole architecture depends on the browser making that request successfully.

- [ ] **Step 6: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel SPA config"
git push
```

---

## Done when

- Four halls render, open ones with items and closed ones labelled
- Sorting by calories, protein, fat, and carbs works in both directions
- Items with unknown macros show `—` and sort last, never as zero
- Repeat page loads on the same day issue zero network requests
- `npm run test` passes, `npx tsc --noEmit` is clean
- The site is deployed and works on a phone

## Deliberately not in M1

The plate builder (M2), period switching, allergen filters, and saved targets (M3). See spec §8.
