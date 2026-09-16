import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";
import { HALLS } from "../src/domain/halls";
import { normalizeHallDay } from "../src/domain/normalize";
import fixture from "./fixtures/baker-open.json";
import type { HallDay } from "../src/domain/types";

const state = vi.hoisted(() => ({
  days: [] as HallDay[],
  loading: false,
  error: null as string | null,
  date: "2026-08-29",
}));
vi.mock("../src/state/useMenus", () => ({ useMenus: () => state }));
afterEach(cleanup);
function setup() {
  const baker = normalizeHallDay(HALLS[0], fixture, state.date);
  baker.periods = [
    { id: "b", name: "Breakfast" },
    { id: "d", name: "Dinner" },
  ];
  baker.menus = [
    {
      id: "b",
      name: "Breakfast",
      items: [{ ...baker.menus[0].items[0], name: "Blueberry Muffin" }],
    },
    {
      id: "d",
      name: "Dinner",
      items: [{ ...baker.menus[0].items[0], name: "Roast Chicken" }],
    },
  ];
  state.days = [
    baker,
    {
      ...baker,
      hall: HALLS[1],
      menus: [
        {
          id: "d2",
          name: "Dinner",
          items: [{ ...baker.menus[0].items[0], name: "Grilled Salmon" }],
        },
      ],
    },
    { ...baker, hall: HALLS[2], closed: true, menus: [], periods: [] },
    {
      ...baker,
      hall: HALLS[3],
      menus: [],
      periods: [{ id: "d3", name: "Dinner" }],
    },
  ];
  state.loading = false;
  state.error = null;
  render(<App />);
}
describe("menu browsing", () => {
  it("preserves the selected meal when switching halls and displays only that hall", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    expect(screen.getByText("Roast Chicken")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(HALLS[1].name) }),
    );
    expect(screen.getByText("Grilled Salmon")).toBeDefined();
    expect(screen.queryByText("Roast Chicken")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Dinner" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("searches case-insensitively, shows an empty state, and can clear the query", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Breakfast" }));
    const search = screen.getByRole("searchbox", { name: "Search menu" });
    fireEvent.change(search, { target: { value: "  MUFFIN  " } });
    expect(screen.getByText("Blueberry Muffin")).toBeDefined();
    fireEvent.change(search, { target: { value: "pizza" } });
    expect(screen.getByText("No matching dishes")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Blueberry Muffin")).toBeDefined();
  });
  it("keeps closed halls selectable and distinguishes closed from missing menu data", () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(HALLS[2].name) }),
    );
    expect(screen.getByRole("heading", { name: "Closed today" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(HALLS[3].name) }),
    );
    expect(
      screen.getByRole("heading", { name: "Menu unavailable" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /high protein/i })).toBeNull();
  });
  it("communicates loading and errors without reporting every hall as closed", () => {
    state.days = [];
    state.loading = true;
    state.error = null;
    const { rerender } = render(<App />);
    expect(screen.getByRole("status").textContent).toContain("Loading menus");
    state.loading = false;
    state.error = "Network unavailable";
    rerender(<App />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Network unavailable",
    );
    expect(screen.queryByText("Every dining hall is closed today.")).toBeNull();
  });
});
