import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONSTRAINTS,
  deviation,
  suggestPlate,
  type MacroTargets,
  type PlateConstraints,
  type SuggestedPlate,
} from "../src/domain/plate";
import { normalizeHallDay } from "../src/domain/normalize";
import { HALLS } from "../src/domain/halls";
import type { MenuItem } from "../src/domain/types";
import fixture from "./fixtures/baker-open.json";

function item(over: Partial<MenuItem>): MenuItem {
  return {
    id: "x", name: "x", description: "", portion: "", ingredients: "",
    category: "Grill", calories: 100, protein_g: 10, fat_g: 5, carbs_g: 20,
    sugar_g: null, fiber_g: null, sodium_mg: null, macrosComplete: true,
    ...over,
  };
}

function targets(over: Partial<MacroTargets> = {}): MacroTargets {
  return { calories: 800, protein_g: 40, carbs_g: 90, fat_g: 25, ...over };
}

const fixtureItems = normalizeHallDay(
  HALLS[0],
  fixture,
  "2026-08-29",
).menus[0].items;

describe("deviation", () => {
  it("scores an exact hit as zero", () => {
    expect(deviation(targets(), targets())).toBe(0);
  });

  it("scores double every macro as fully wrong", () => {
    const doubled = {
      calories: 1600, protein_g: 80, carbs_g: 180, fat_g: 50,
    };
    expect(deviation(doubled, targets())).toBeCloseTo(1);
  });

  it("penalises overshoot and undershoot equally", () => {
    const over = deviation(targets({ protein_g: 50 }), targets());
    const under = deviation(targets({ protein_g: 30 }), targets());
    expect(over).toBeCloseTo(under);
  });

  it("does not divide by zero on a zero target", () => {
    const score = deviation(targets(), targets({ protein_g: 0 }));
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe("suggestPlate constraints", () => {
  const cases: { label: string; items: MenuItem[]; constraints: PlateConstraints }[] = [
    {
      label: "captured Baker menu, default constraints",
      items: fixtureItems,
      constraints: DEFAULT_CONSTRAINTS,
    },
    {
      label: "captured Baker menu, tight constraints",
      items: fixtureItems,
      constraints: { maxItems: 3, maxPerItem: 1, minCategories: 2 },
    },
    {
      label: "captured Baker menu, loose constraints",
      items: fixtureItems,
      constraints: { maxItems: 10, maxPerItem: 4, minCategories: 3 },
    },
    {
      label: "synthetic menu with incomplete items mixed in",
      items: [
        item({ id: "a", category: "Grill", calories: 300, protein_g: 25 }),
        item({ id: "b", category: "Salad", calories: 120, protein_g: 4 }),
        item({ id: "c", category: "Deli", protein_g: null, macrosComplete: false }),
        item({ id: "d", category: "Bakery", calories: 450, fat_g: 22 }),
      ],
      constraints: DEFAULT_CONSTRAINTS,
    },
  ];

  const targetSet = [
    targets(),
    targets({ calories: 400, protein_g: 20, carbs_g: 40, fat_g: 12 }),
    targets({ calories: 1500, protein_g: 90, carbs_g: 150, fat_g: 55 }),
  ];

  for (const { label, items, constraints } of cases) {
    for (const [n, target] of targetSet.entries()) {
      it(`${label}, target set ${n}, satisfies every declared constraint`, () => {
        const plate = suggestPlate(items, target, constraints);
        const servings = plate.selections.reduce((s, x) => s + x.servings, 0);

        expect(servings).toBeLessThanOrEqual(constraints.maxItems);
        for (const selection of plate.selections) {
          expect(Number.isInteger(selection.servings)).toBe(true);
          expect(selection.servings).toBeGreaterThanOrEqual(1);
          expect(selection.servings).toBeLessThanOrEqual(constraints.maxPerItem);
          // Identity, not name: the plate must reference the caller's objects.
          expect(items).toContain(selection.item);
          expect(selection.item.macrosComplete).toBe(true);
        }

        const categories = new Set(
          plate.selections.map((s) => s.item.category),
        );
        if (plate.shortfall === null) {
          expect(categories.size).toBeGreaterThanOrEqual(
            constraints.minCategories,
          );
        }
      });
    }
  }

  it("reports totals that equal the sum of its own selections", () => {
    const plate = suggestPlate(fixtureItems, targets());
    const expected = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    for (const { item: selected, servings } of plate.selections) {
      expected.calories += (selected.calories ?? 0) * servings;
      expected.protein_g += (selected.protein_g ?? 0) * servings;
      expected.carbs_g += (selected.carbs_g ?? 0) * servings;
      expected.fat_g += (selected.fat_g ?? 0) * servings;
    }
    expect(plate.totals).toEqual(expected);
  });

  it("reports the deviation of the totals it returns", () => {
    const target = targets();
    const plate = suggestPlate(fixtureItems, target);
    expect(plate.deviation).toBeCloseTo(deviation(plate.totals, target));
  });
});

describe("suggestPlate edge cases", () => {
  const expectWellFormed = (plate: SuggestedPlate) => {
    expect(Array.isArray(plate.selections)).toBe(true);
    expect(Number.isFinite(plate.deviation)).toBe(true);
    expect(plate.totals).toBeDefined();
  };

  it("returns an empty plate for an empty menu", () => {
    const plate = suggestPlate([], targets());
    expectWellFormed(plate);
    expect(plate.selections).toEqual([]);
    expect(plate.shortfall).toBe("no-complete-items");
  });

  it("returns an empty plate when every item is incomplete", () => {
    const items = [
      item({ id: "a", calories: null, macrosComplete: false }),
      item({ id: "b", protein_g: null, macrosComplete: false }),
    ];
    const plate = suggestPlate(items, targets());
    expectWellFormed(plate);
    expect(plate.selections).toEqual([]);
    expect(plate.shortfall).toBe("no-complete-items");
  });

  it("treats macrosComplete as a claim to verify, not to trust", () => {
    // A hand-built or upstream-shifted item can carry the flag with a null
    // macro. Summing that as zero would silently understate the plate.
    const lying = item({ id: "liar", protein_g: null, macrosComplete: true });
    const plate = suggestPlate([lying], targets());
    expect(plate.selections).toEqual([]);
    expect(plate.shortfall).toBe("no-complete-items");
  });

  it("flags a single-category menu rather than returning nothing", () => {
    const items = [
      item({ id: "a", category: "Grill", calories: 300, protein_g: 25 }),
      item({ id: "b", category: "Grill", calories: 150, protein_g: 8 }),
    ];
    const plate = suggestPlate(items, targets());
    expectWellFormed(plate);
    expect(plate.shortfall).toBe("targets-unreachable");
    expect(plate.selections.length).toBeGreaterThan(0);
  });

  it("does not overshoot a target smaller than the smallest serving", () => {
    const items = [
      item({ id: "a", category: "Grill", calories: 900, protein_g: 60 }),
      item({ id: "b", category: "Salad", calories: 800, protein_g: 50 }),
    ];
    const plate = suggestPlate(
      items,
      targets({ calories: 50, protein_g: 3, carbs_g: 5, fat_g: 1 }),
    );
    expectWellFormed(plate);
    // Adding any dish moves further from target, so the best plate is empty —
    // and saying so beats padding it out to meet the category floor.
    expect(plate.selections).toEqual([]);
    expect(plate.shortfall).toBe("targets-unreachable");
  });

  it("stays within maxItems when targets are unreachably large", () => {
    const items = [
      item({ id: "a", category: "Grill" }),
      item({ id: "b", category: "Salad" }),
    ];
    const plate = suggestPlate(
      items,
      targets({ calories: 9000, protein_g: 500, carbs_g: 900, fat_g: 300 }),
    );
    expectWellFormed(plate);
    const servings = plate.selections.reduce((s, x) => s + x.servings, 0);
    expect(servings).toBeLessThanOrEqual(DEFAULT_CONSTRAINTS.maxItems);
  });

  it("does not mutate the input", () => {
    const snapshot = JSON.stringify(fixtureItems);
    suggestPlate(fixtureItems, targets());
    expect(JSON.stringify(fixtureItems)).toBe(snapshot);
  });
});

describe("suggestPlate determinism", () => {
  it("returns identical selections for identical input", () => {
    const signature = (plate: SuggestedPlate) =>
      plate.selections.map((s) => [s.item.id, s.item.name, s.servings]);
    const a = suggestPlate(fixtureItems, targets());
    const b = suggestPlate(fixtureItems, targets());
    expect(signature(a)).toEqual(signature(b));
  });

  it("breaks ties toward the earlier item in the input", () => {
    const first = item({ id: "first", category: "Grill" });
    const second = item({ id: "second", category: "Grill" });
    const plate = suggestPlate([first, second], targets(), {
      maxItems: 1,
      maxPerItem: 1,
      minCategories: 1,
    });
    expect(plate.selections[0].item.id).toBe("first");
  });
});

describe("suggestPlate quality", () => {
  it("lands close to a realistic target on the captured menu", () => {
    const plate = suggestPlate(fixtureItems, targets());
    // Observed 0.0334 on the captured Baker breakfast menu at the time of
    // writing — 750 kcal / 40 P / 91 C / 26.5 F against a 800 / 40 / 90 / 25
    // target. The threshold is loose enough to survive a fixture refresh and
    // tight enough that a search regression shows up as a failure.
    expect(plate.deviation).toBeLessThan(0.15);
    expect(plate.shortfall).toBeNull();
  });

  it("beats the empty plate whenever it selects anything", () => {
    const target = targets();
    const plate = suggestPlate(fixtureItems, target);
    const emptyScore = deviation(
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      target,
    );
    expect(plate.deviation).toBeLessThan(emptyScore);
  });
});
