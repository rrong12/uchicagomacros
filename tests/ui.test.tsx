import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HallCard } from "../src/ui/HallCard";
import { ItemRow } from "../src/ui/ItemRow";
import { HALLS } from "../src/domain/halls";
import type { HallDay, MenuItem } from "../src/domain/types";

afterEach(cleanup);

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "i1",
    name: "Scrambled Eggs",
    description: "",
    portion: "1/2 cup",
    ingredients: "",
    category: "Kitchen",
    calories: 210,
    protein_g: 14,
    fat_g: 16,
    carbs_g: 1,
    sugar_g: null,
    fiber_g: null,
    sodium_mg: null,
    macrosComplete: true,
    ...over,
  };
}

function day(over: Partial<HallDay> = {}): HallDay {
  return {
    hall: HALLS[0],
    date: "2026-08-29",
    closed: false,
    periods: [{ id: "p1", name: "Breakfast" }],
    menus: [{ id: "p1", name: "Breakfast", items: [item()] }],
    ...over,
  };
}

describe("ItemRow", () => {
  it("renders known macros with their labels", () => {
    render(
      <ul>
        <ItemRow item={item()} />
      </ul>,
    );
    expect(screen.getByText("210")).toBeDefined();
    expect(screen.getByText("14")).toBeDefined();
  });

  it("renders an unknown macro as an em dash, never as zero", () => {
    const { container } = render(
      <ul>
        <ItemRow
          item={item({
            calories: null,
            protein_g: null,
            fat_g: null,
            carbs_g: null,
          })}
        />
      </ul>,
    );
    const macros = container.querySelector(".macros")!;
    expect(macros.querySelectorAll("b").length).toBe(4);
    for (const b of macros.querySelectorAll("b")) {
      expect(b.textContent).toBe("—");
      // The critical invariant: a missing macro must never render as 0.
      expect(b.textContent).not.toBe("0");
    }
  });
});

describe("HallCard", () => {
  it("shows a message when the selected period has no menu", () => {
    render(<HallCard day={day({ menus: [] })} period="Dinner" />);
    expect(screen.getByText("Menu unavailable")).toBeDefined();
  });

  it("renders only the selected period", () => {
    const d = day({
      periods: [
        { id: "p1", name: "Breakfast" },
        { id: "p2", name: "Dinner" },
      ],
      menus: [
        { id: "p1", name: "Breakfast", items: [item({ name: "Eggs" })] },
        {
          id: "p2",
          name: "Dinner",
          items: [item({ id: "i2", name: "Roast Chicken" })],
        },
      ],
    });
    const { container } = render(<HallCard day={d} period="Dinner" />);
    const names = [...container.querySelectorAll(".item-name")].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Roast Chicken"]);
    expect(names).not.toContain("Eggs");
  });

  it("groups items by category when not sorting", () => {
    const items = [
      item({ id: "a", name: "Eggs", category: "Kitchen" }),
      item({ id: "b", name: "Muffin", category: "Sweet Shoppe" }),
    ];
    const { container } = render(
      <HallCard
        day={day({ menus: [{ id: "p1", name: "Breakfast", items }] })}
        period="Breakfast"
      />,
    );
    const cats = [...container.querySelectorAll(".category-name")].map(
      (n) => n.textContent,
    );
    expect(cats).toEqual(["Kitchen", "Sweet Shoppe"]);
  });
});
