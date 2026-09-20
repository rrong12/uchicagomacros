import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../src/App";
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

/** Two complete dishes in different stations, so a suggestion is possible. */
function menuItems(over: Partial<MenuItem>[] = []): MenuItem[] {
  const base = normalizeHallDay(HALLS[0], fixture, state.date).menus[0].items[0];
  const defaults: Partial<MenuItem>[] = [
    {
      id: "chicken", name: "Roast Chicken", category: "Kitchen",
      calories: 300, protein_g: 30, carbs_g: 2, fat_g: 18, macrosComplete: true,
    },
    {
      id: "rice", name: "Brown Rice", category: "Create",
      calories: 200, protein_g: 5, carbs_g: 44, fat_g: 2, macrosComplete: true,
    },
  ];
  return (over.length > 0 ? over : defaults).map((o) => ({ ...base, ...o }));
}

function setMenu(items: MenuItem[]) {
  const day = normalizeHallDay(HALLS[0], fixture, state.date);
  day.menus = [{ id: "b", name: "Breakfast", items }];
  day.periods = day.menus.map(({ id, name }) => ({ id, name }));
  state.days = [day];
}

beforeEach(() => {
  localStorage.clear();
  setMenu(menuItems());
});
afterEach(cleanup);

function start() {
  const view = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Breakfast" }));
  return view;
}

/**
 * Target inputs are matched by role, not by label text alone: once the plate
 * holds dishes, "Calories" also matches its running total.
 */
function targetInput(label: string) {
  return screen.getByRole("spinbutton", {
    name: new RegExp(`^${label}`),
  }) as HTMLInputElement;
}

function setTargets(values: Record<string, number>) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(targetInput(label), { target: { value: String(value) } });
  }
}

it("suggests a plate for the targets and accepts it into the plate", () => {
  start();
  setTargets({ Calories: 500, Protein: 35, Carbs: 46, Fat: 20 });
  fireEvent.click(screen.getByRole("button", { name: "Suggest a plate" }));

  // 1 chicken + 1 rice is an exact hit on those targets.
  expect(screen.getByText("1× Roast Chicken")).toBeDefined();
  expect(screen.getByText("1× Brown Rice")).toBeDefined();
  expect(screen.getByText(/0% average distance/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Use this plate" }));
  const plate = within(screen.getByRole("region", { name: "Your plate" }));
  expect(plate.getByLabelText("Calories total").textContent).toBe("500 kcal");
  expect(plate.getByLabelText("Protein total").textContent).toBe("35 g");
});

it("confirms before overwriting a plate that already has dishes", () => {
  start();
  fireEvent.click(
    screen.getByRole("button", { name: "Add Roast Chicken to plate" }),
  );
  setTargets({ Calories: 500, Protein: 35, Carbs: 46, Fat: 20 });
  fireEvent.click(screen.getByRole("button", { name: "Suggest a plate" }));
  fireEvent.click(screen.getByRole("button", { name: "Use this plate" }));

  // Nothing replaced yet — the plate still holds the manual choice.
  expect(screen.getByLabelText("Calories total").textContent).toBe("300 kcal");
  fireEvent.click(screen.getByRole("button", { name: "Keep what I have" }));
  expect(screen.getByLabelText("Calories total").textContent).toBe("300 kcal");

  fireEvent.click(screen.getByRole("button", { name: "Use this plate" }));
  fireEvent.click(screen.getByRole("button", { name: "Replace my plate" }));
  // 500, not 800: the suggestion replaced the chicken rather than adding to it.
  expect(screen.getByLabelText("Calories total").textContent).toBe("500 kcal");
});

it("meets the two-station floor even when one dish would score better", () => {
  start();
  // Brown Rice alone is an exact hit, but a plate is a meal, not a side —
  // spec §6 requires two stations, so the suggestion adds a second dish.
  setTargets({ Calories: 200, Protein: 5, Carbs: 44, Fat: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Suggest a plate" }));
  expect(screen.getByText("1× Brown Rice")).toBeDefined();
  expect(screen.getByText("1× Roast Chicken")).toBeDefined();
});

it("persists targets across a remount", () => {
  const view = start();
  setTargets({ Protein: 77 });
  view.unmount();
  start();
  expect(targetInput("Protein").value).toBe("77");
});

it("falls back to defaults when stored targets are malformed", () => {
  localStorage.setItem("uchicagomacros:targets:v1", '{"protein_g":"lots"}');
  start();
  expect(targetInput("Protein").value).toBe("40");
});

it("explains itself when no dish reports full nutrition", () => {
  setMenu(
    menuItems([
      {
        id: "mystery", name: "Mystery Soup", category: "Kitchen",
        calories: 100, protein_g: null, carbs_g: 4, fat_g: 1,
        macrosComplete: false,
      },
    ]),
  );
  start();
  expect(screen.getByText("0 of 1 dishes have full nutrition")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Suggest a plate" }));
  expect(screen.getByText(/No dish on this menu reports a full set/))
    .toBeDefined();
  expect(screen.queryByRole("button", { name: "Use this plate" })).toBeNull();
});

it("explains itself when nothing gets closer than an empty plate", () => {
  start();
  setTargets({ Calories: 10, Protein: 1, Carbs: 1, Fat: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Suggest a plate" }));
  expect(screen.getByText(/Nothing on this menu gets closer/)).toBeDefined();
});

it("clears a stale suggestion when the targets change", () => {
  start();
  setTargets({ Calories: 500, Protein: 35, Carbs: 46, Fat: 20 });
  fireEvent.click(screen.getByRole("button", { name: "Suggest a plate" }));
  expect(screen.getByText("1× Roast Chicken")).toBeDefined();
  setTargets({ Protein: 60 });
  expect(screen.queryByText("1× Roast Chicken")).toBeNull();
});
