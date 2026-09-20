import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeHallDay, type RawFilter } from "../src/domain/normalize";
import { filterItems, hasLabels } from "../src/domain/filter";
import { HALLS } from "../src/domain/halls";
import type { MenuItem } from "../src/domain/types";
import fixture from "./fixtures/baker-open.json";

const items = normalizeHallDay(HALLS[0], fixture, "2026-08-29").menus[0].items;
const byName = (name: string) => items.find((i) => i.name === name)!;

function item(over: Partial<MenuItem>): MenuItem {
  return {
    id: "x", name: "x", description: "", portion: "", ingredients: "",
    category: "Grill", labels: [], allergens: [],
    calories: 100, protein_g: 10, fat_g: 5, carbs_g: 20,
    sugar_g: null, fiber_g: null, sodium_mg: null, macrosComplete: true,
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("normalizing filters[] from the captured fixture", () => {
  it("reads dietary labels off every item", () => {
    expect(items.every((i) => i.labels.length > 0)).toBe(true);
    const vegetarian = items.filter((i) => i.labels.includes("Vegetarian"));
    expect(vegetarian).toHaveLength(18);
  });

  it("separates labels from allergens", () => {
    const strudel = byName("Apple Strudel");
    expect(strudel.labels).toContain("Vegetarian");
    expect(strudel.labels).not.toContain("Egg");
    expect(strudel.allergens.map((a) => a.name)).toContain("Egg");
  });

  it("strips the star and records it as trace", () => {
    // "Blueberry Muffin" carries Egg* alongside unstarred Gluten/Milk/Soy/Wheat.
    const muffin = byName("Blueberry Muffin");
    const egg = muffin.allergens.find((a) => a.name === "Egg")!;
    expect(egg).toEqual({ name: "Egg", trace: true });
    const milk = muffin.allergens.find((a) => a.name === "Milk")!;
    expect(milk).toEqual({ name: "Milk", trace: false });
    // No name should retain the raw marker.
    expect(items.flatMap((i) => i.allergens).every((a) => !a.name.endsWith("*")))
      .toBe(true);
  });

  it("gives an untagged item empty arrays, never null", () => {
    const [bare] = normalizeHallDay(
      HALLS[0],
      {
        closed: false,
        menu: {
          date: "2026-08-29",
          periods: {
            id: "p", name: "Breakfast",
            categories: [{ name: "Grill", items: [{ id: "a", name: "Toast" }] }],
          },
        },
        periods: [{ id: "p", name: "Breakfast" }],
      },
      "2026-08-29",
    ).menus[0].items;
    expect(bare.labels).toEqual([]);
    expect(bare.allergens).toEqual([]);
  });
});

describe("normalizing unexpected filter data", () => {
  const withFilters = (filters: RawFilter[]) => ({
    closed: false,
    menu: {
      date: "2026-08-29",
      periods: {
        id: "p", name: "Breakfast",
        categories: [{ name: "Grill", items: [{ id: "a", name: "X", filters }] }],
      },
    },
    periods: [{ id: "p", name: "Breakfast" }],
  });

  it("warns on an unrecognized type and keeps the tags it understands", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [parsed] = normalizeHallDay(
      HALLS[0],
      withFilters([
        { name: "Vegetarian", type: "label" },
        { name: "Mystery", type: "vibe" },
        { name: "Milk", type: "allergen" },
      ]),
      "",
    ).menus[0].items;
    expect(parsed.labels).toEqual(["Vegetarian"]);
    expect(parsed.allergens).toEqual([{ name: "Milk", trace: false }]);
    expect(warn).toHaveBeenCalled();
  });

  it("drops blank names and deduplicates", () => {
    const [parsed] = normalizeHallDay(
      HALLS[0],
      withFilters([
        { name: "", type: "label" },
        { name: "*", type: "allergen" },
        { name: "Vegan", type: "label" },
        { name: "Vegan", type: "label" },
        { name: "Soy", type: "allergen" },
        { name: "Soy", type: "allergen" },
      ]),
      "",
    ).menus[0].items;
    expect(parsed.labels).toEqual(["Vegan"]);
    expect(parsed.allergens).toEqual([{ name: "Soy", trace: false }]);
  });

  it("keeps the stronger claim when one dish lists both forms", () => {
    // Unobserved upstream, but showing a dish two contradictory ways would be
    // worse than collapsing to the definite tag.
    const [parsed] = normalizeHallDay(
      HALLS[0],
      withFilters([
        { name: "Milk*", type: "allergen" },
        { name: "Milk", type: "allergen" },
      ]),
      "",
    ).menus[0].items;
    expect(parsed.allergens).toEqual([{ name: "Milk", trace: false }]);
  });
});

describe("hasLabels", () => {
  const vegan = item({ labels: ["Vegetarian", "Vegan"] });

  it("requires every selected label, not any", () => {
    expect(hasLabels(vegan, ["Vegetarian"])).toBe(true);
    expect(hasLabels(vegan, ["Vegetarian", "Vegan"])).toBe(true);
    expect(hasLabels(vegan, ["Vegan", "Avoiding Gluten"])).toBe(false);
  });

  it("matches everything when nothing is selected", () => {
    expect(hasLabels(item({ labels: [] }), [])).toBe(true);
  });

  it("matches exactly, so an upstream rename surfaces", () => {
    expect(hasLabels(vegan, ["vegan"])).toBe(false);
  });
});

describe("filterItems with labels", () => {
  const menu = [
    item({ id: "a", labels: ["Vegetarian"] }),
    item({ id: "b", labels: ["Vegetarian", "Vegan"] }),
    item({ id: "c", labels: [] }),
  ];

  it("narrows by intersection", () => {
    expect(filterItems(menu, { labels: ["Vegetarian"] }).map((i) => i.id))
      .toEqual(["a", "b"]);
    expect(filterItems(menu, { labels: ["Vegetarian", "Vegan"] }).map((i) => i.id))
      .toEqual(["b"]);
  });

  it("returns everything for an empty label list", () => {
    expect(filterItems(menu, { labels: [] })).toHaveLength(3);
    expect(filterItems(menu, {})).toHaveLength(3);
  });

  it("composes with the macro filters", () => {
    const mixed = [
      item({ id: "a", labels: ["Vegan"], protein_g: 30 }),
      item({ id: "b", labels: ["Vegan"], protein_g: 2 }),
    ];
    expect(filterItems(mixed, { labels: ["Vegan"], minProtein: 10 }).map((i) => i.id))
      .toEqual(["a"]);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(menu);
    filterItems(menu, { labels: ["Vegetarian"] });
    expect(JSON.stringify(menu)).toBe(before);
  });
});
