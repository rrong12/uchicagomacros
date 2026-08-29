import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HallCard } from "../src/ui/HallCard";
import { ItemRow } from "../src/ui/ItemRow";
import { HALLS } from "../src/domain/halls";
import type { HallDay, MenuItem } from "../src/domain/types";

afterEach(cleanup);

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "i1", name: "Scrambled Eggs", description: "", portion: "1/2 cup",
    ingredients: "", category: "Kitchen",
    calories: 210, protein_g: 14, fat_g: 16, carbs_g: 1,
    sugar_g: null, fiber_g: null, sodium_mg: null, macrosComplete: true,
    ...over,
  };
}

function day(over: Partial<HallDay> = {}): HallDay {
  return {
    hall: HALLS[0], date: "2026-08-29", closed: false,
    periods: [{ id: "p1", name: "Breakfast" }],
    currentPeriod: { id: "p1", name: "Breakfast", items: [item()] },
    ...over,
  };
}

describe("ItemRow", () => {
  it("renders known macros with their units", () => {
    render(<ul><ItemRow item={item()} /></ul>);
    expect(screen.getByText("210 cal")).toBeDefined();
    expect(screen.getByText("P 14g")).toBeDefined();
  });

  it("renders an unknown macro as an em dash, never as zero", () => {
    const { container } = render(
      <ul>
        <ItemRow
          item={item({ calories: null, protein_g: null, fat_g: null, carbs_g: null })}
        />
      </ul>
    );
    const macros = container.querySelector(".item-macros")!.textContent!;
    expect(macros).toContain("—");
    // The critical invariant: a missing macro must never render as 0.
    expect(macros).not.toMatch(/\b0\b/);
    // And the unit suffix must be dropped, not appended to the dash.
    expect(macros).not.toContain("— cal");
  });
});

describe("HallCard", () => {
  it("renders a closed hall as closed rather than empty", () => {
    render(<HallCard day={day({ closed: true, currentPeriod: null, periods: [] })}
      sortField="protein_g" sortDirection="desc" />);
    expect(screen.getByText("Closed today")).toBeDefined();
  });

  it("distinguishes an open hall with no items from a closed one", () => {
    render(<HallCard day={day({ currentPeriod: null })}
      sortField="protein_g" sortDirection="desc" />);
    expect(screen.getByText("No items listed")).toBeDefined();
  });

  it("shows the period name for an open hall", () => {
    render(<HallCard day={day()} sortField="protein_g" sortDirection="desc" />);
    expect(screen.getByText("Breakfast")).toBeDefined();
  });

  it("orders items by the requested macro, with unknowns last", () => {
    const items = [
      item({ id: "a", name: "Low", protein_g: 2 }),
      item({ id: "b", name: "Unknown", protein_g: null, macrosComplete: false }),
      item({ id: "c", name: "High", protein_g: 40 }),
    ];
    const { container } = render(
      <HallCard
        day={day({ currentPeriod: { id: "p1", name: "Breakfast", items } })}
        sortField="protein_g"
        sortDirection="desc"
      />
    );
    const names = [...container.querySelectorAll(".item-name")].map((n) => n.textContent);
    expect(names).toEqual(["High", "Low", "Unknown"]);
  });
});
