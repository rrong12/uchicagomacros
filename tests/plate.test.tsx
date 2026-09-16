import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import App from "../src/App";
import { HALLS } from "../src/domain/halls";
import { normalizeHallDay } from "../src/domain/normalize";
import fixture from "./fixtures/baker-open.json";
const state = vi.hoisted(() => ({
  days: [] as import("../src/domain/types").HallDay[],
  loading: false,
  error: null,
  date: "2026-08-29",
}));
vi.mock("../src/state/useMenus", () => ({ useMenus: () => state }));
beforeEach(() => {
  localStorage.clear();
  const day = normalizeHallDay(HALLS[0], fixture, state.date);
  const item = {
    ...day.menus[0].items[0],
    name: "Test meal",
    calories: 200,
    protein_g: 10,
    carbs_g: 20,
    fat_g: null,
  };
  day.menus = [
    { id: "b", name: "Breakfast", items: [item] },
    { id: "d", name: "Dinner", items: [item] },
  ];
  day.periods = day.menus.map(({ id, name }) => ({ id, name }));
  state.days = [day];
});
afterEach(cleanup);
function start() {
  const view = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Breakfast" }));
  return view;
}
it("adds dishes, scales totals, preserves unknown nutrition, and removes them", () => {
  start();
  fireEvent.click(
    screen.getByRole("button", { name: "Add Test meal to plate" }),
  );
  const plate = within(screen.getByRole("region", { name: "Your plate" }));
  expect(
    screen.getByRole("link", { name: /View plate/ }).getAttribute("href"),
  ).toBe("#your-plate");
  expect(plate.getByLabelText("Calories total").textContent).toBe("200 kcal");
  expect(plate.getByLabelText("Fat total").textContent).toBe("Incomplete");
  fireEvent.click(
    plate.getByRole("button", { name: "Increase Test meal servings" }),
  );
  expect(plate.getByLabelText("Calories total").textContent).toBe("300 kcal");
  expect(plate.getByLabelText("Protein total").textContent).toBe("15 g");
  fireEvent.click(plate.getByRole("button", { name: "Remove Test meal" }));
  expect(plate.getByText("Your plate is empty")).toBeDefined();
});
it("restores saved plates and keeps meals separate", () => {
  const view = start();
  fireEvent.click(
    screen.getByRole("button", { name: "Add Test meal to plate" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
  expect(screen.getByText("Your plate is empty")).toBeDefined();
  view.unmount();
  start();
  expect(screen.getByLabelText("Calories total").textContent).toBe("200 kcal");
});
it("ignores malformed saved data without crashing", () => {
  localStorage.setItem("uchicagomacros:plates:v1", '{"bad":null}');
  start();
  expect(screen.getByText("Your plate is empty")).toBeDefined();
});
it("supports half servings and repeated adds without duplicate rows", () => {
  start();
  const add = screen.getByRole("button", { name: "Add Test meal to plate" });
  fireEvent.click(add);
  fireEvent.click(add);
  expect(screen.getByLabelText("Calories total").textContent).toBe("400 kcal");
  const decrease = screen.getByRole("button", {
    name: "Decrease Test meal servings",
  });
  fireEvent.click(decrease);
  fireEvent.click(decrease);
  fireEvent.click(decrease);
  expect(screen.getByLabelText("Calories total").textContent).toBe("100 kcal");
  expect((decrease as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear plate" }));
  expect(screen.getByText("Your plate is empty")).toBeDefined();
});
it("keeps plates separate between halls and dates", () => {
  state.days.push({ ...state.days[0], hall: HALLS[1] });
  const view = start();
  fireEvent.click(
    screen.getByRole("button", { name: "Add Test meal to plate" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(HALLS[1].name) }),
  );
  expect(screen.getByText("Your plate is empty")).toBeDefined();
  view.unmount();
  state.days = state.days.map((d) => ({ ...d, date: "2026-08-30" }));
  start();
  expect(screen.getByText("Your plate is empty")).toBeDefined();
});
it("continues in memory and explains when browser storage fails", () => {
  start();
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage full");
  });
  try {
    fireEvent.click(
      screen.getByRole("button", { name: "Add Test meal to plate" }),
    );
    expect(screen.getByLabelText("Calories total").textContent).toBe(
      "200 kcal",
    );
    expect(
      screen.getByText(/This browser could not save your plate/),
    ).toBeDefined();
  } finally {
    spy.mockRestore();
  }
});
