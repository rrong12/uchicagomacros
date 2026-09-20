import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";
import { ItemRow } from "../src/ui/ItemRow";
import { HALLS } from "../src/domain/halls";
import { normalizeHallDay } from "../src/domain/normalize";
import type { HallDay, MenuItem } from "../src/domain/types";
import fixture from "./fixtures/baker-open.json";

const state = vi.hoisted(() => ({
  days: [] as HallDay[],
  loading: false,
  error: null,
  date: "2026-08-29",
}));
vi.mock("../src/state/useMenus", () => ({ useMenus: () => state }));

const base = normalizeHallDay(HALLS[0], fixture, "2026-08-29").menus[0].items[0];
const item = (over: Partial<MenuItem>): MenuItem => ({ ...base, ...over });

function setMenu(items: MenuItem[], periods = ["Breakfast", "Dinner"]) {
  const day = normalizeHallDay(HALLS[0], fixture, state.date);
  day.menus = periods.map((name, i) => ({ id: `p${i}`, name, items }));
  day.periods = day.menus.map(({ id, name }) => ({ id, name }));
  state.days = [day];
}

const MENU = [
  item({ id: "a", name: "Tofu Scramble", labels: ["Vegetarian", "Vegan"] }),
  item({ id: "b", name: "Cheese Omelette", labels: ["Vegetarian"] }),
  item({ id: "c", name: "Pork Sausage", labels: [] }),
];

beforeEach(() => {
  localStorage.clear();
  setMenu(MENU);
});
afterEach(cleanup);

function start() {
  const view = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Breakfast" }));
  return view;
}

const chip = (name: string | RegExp) =>
  screen.getByRole("button", { name: new RegExp(name, "i") });

it("derives chips from the menu on screen, with counts", () => {
  start();
  const group = screen.getByRole("group", { name: "Dietary labels" });
  const names = [...group.querySelectorAll("button")].map((b) => b.textContent);
  // Vegetarian (2) outranks Vegan (1); nothing else is offered, because
  // nothing else is labelled.
  expect(names).toEqual(["Vegetarian2", "Vegan1"]);
});

it("offers no chip row when the menu carries no labels", () => {
  setMenu([item({ id: "z", name: "Mystery", labels: [] })]);
  start();
  expect(screen.queryByRole("group", { name: "Dietary labels" })).toBeNull();
});

it("narrows the menu to the selected label and back again", () => {
  start();
  expect(screen.getByText("Pork Sausage")).toBeDefined();

  fireEvent.click(chip("Vegetarian"));
  expect(screen.queryByText("Pork Sausage")).toBeNull();
  expect(screen.getByText("Cheese Omelette")).toBeDefined();
  expect(screen.getByText(/2 dishes labelled Vegetarian/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("Pork Sausage")).toBeDefined();
});

it("intersects multiple labels rather than unioning them", () => {
  start();
  fireEvent.click(chip("Vegetarian"));
  fireEvent.click(chip("Vegan"));
  expect(screen.getByText("Tofu Scramble")).toBeDefined();
  expect(screen.queryByText("Cheese Omelette")).toBeNull();
  expect(screen.getByText(/every selected label/)).toBeDefined();
});

it("explains an empty result from filters, not from search", () => {
  setMenu([
    item({ id: "a", name: "Cheese Omelette", labels: ["Vegetarian"] }),
    item({ id: "b", name: "Tofu", labels: ["Vegan"] }),
  ]);
  start();
  fireEvent.click(chip("Vegetarian"));
  fireEvent.click(chip("Vegan"));
  // The old copy said "try a different food or station name", which is useless
  // advice when the search box is empty and the chips are doing the excluding.
  expect(screen.getByText(/No Vegetarian \+ Vegan dishes in this meal/))
    .toBeDefined();
  expect(screen.queryByText(/different food or station name/)).toBeNull();
});

it("names both causes when search and filters are both active", () => {
  start();
  fireEvent.click(chip("Vegan"));
  fireEvent.change(screen.getByLabelText("Search menu"), {
    target: { value: "sausage" },
  });
  expect(screen.getByText(/Nothing matches “sausage” with Vegan/)).toBeDefined();
});

it("drops a stale filter when the meal changes", () => {
  start();
  fireEvent.click(chip("Vegan"));
  expect(screen.queryByText("Pork Sausage")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
  // A label on one menu may be absent from the next; a filter that silently
  // matches nothing reads as a broken app.
  expect(screen.getByText("Pork Sausage")).toBeDefined();
});

it("renders allergen tags, spelling out what a starred one means", () => {
  render(
    <ItemRow
      item={item({
        name: "Blueberry Muffin",
        labels: ["Vegetarian"],
        allergens: [
          { name: "Milk", trace: false },
          { name: "Egg", trace: true },
        ],
      })}
    />,
  );
  expect(screen.getByText("Vegetarian")).toBeDefined();
  expect(screen.getByText("Milk")).toBeDefined();
  // Not a bare asterisk: that means nothing to a reader or a screen reader.
  expect(screen.getByText("may contain Egg")).toBeDefined();
  expect(screen.queryByText("Egg*")).toBeNull();
});
