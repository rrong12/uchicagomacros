import { describe, it, expect, vi } from "vitest";
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

  it("does not warn about known-unmapped nutrient names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizeHallDay(baker, openFixture);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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

  it("does not throw when menu and periods keys are absent entirely", () => {
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
