import { describe, it, expect } from "vitest";
import { sortItems, filterItems } from "../src/domain/filter";
import type { MenuItem } from "../src/domain/types";

function item(over: Partial<MenuItem>): MenuItem {
  return {
    id: "x", name: "x", description: "", portion: "", ingredients: "",
    category: "Grill", labels: [], allergens: [],
    calories: 100, protein_g: 10, fat_g: 5, carbs_g: 20,
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
