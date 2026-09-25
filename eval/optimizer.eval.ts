/**
 * Optimizer eval: how close does `suggestPlate` get to macro targets on real menus?
 *
 * Inputs are raw v1 captures in eval/menus/ (see eval/capture.sh), normalized with the
 * app's own parser. Pure and deterministic: rerunning regenerates eval/results/ byte for byte.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HALLS } from "../src/domain/halls";
import { normalizeHallDay, type RawResponse } from "../src/domain/normalize";
import { DEFAULT_CONSTRAINTS, suggestPlate, type MacroTargets } from "../src/domain/plate";
import { DEFAULT_TARGETS } from "../src/state/useTargets";

const MENUS_DIR = "eval/menus";
const RESULTS_DIR = "eval/results";
const MEALS = ["Breakfast", "Lunch", "Dinner"] as const;
const MACROS = ["calories", "protein_g", "carbs_g", "fat_g"] as const;

/** Fat at 30% of calories; carbs take whatever calories remain after protein and fat. */
function gridTarget(calories: number, protein_g: number): MacroTargets {
  const fat_g = Math.round((0.3 * calories) / 9);
  const carbs_g = Math.round((calories - 4 * protein_g - 9 * fat_g) / 4);
  return { calories, protein_g, carbs_g, fat_g };
}

const TARGET_SETS: Record<string, MacroTargets[]> = {
  default: [DEFAULT_TARGETS],
  grid: [500, 700, 900].flatMap((cal) => [30, 45, 60].map((p) => gridTarget(cal, p))),
};

interface Capture {
  date: string;
  responses: { hallId: string; periodId: string | null; raw: RawResponse }[];
}

interface Run {
  date: string;
  hall: string;
  meal: string;
  targets: MacroTargets;
  deviation: number;
  macroError: Record<(typeof MACROS)[number], number>;
  shortfall: string | null;
  servings: number;
  /** Plate totals and dishes, so a bad run can be diagnosed without rerunning. */
  totals: MacroTargets;
  plate: { name: string; category: string; servings: number }[];
}

function loadMenus() {
  const menus: { date: string; hall: string; meal: string; items: ReturnType<typeof normalizeHallDay>["menus"][number]["items"] }[] = [];
  for (const file of readdirSync(MENUS_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const capture: Capture = JSON.parse(readFileSync(join(MENUS_DIR, file), "utf8"));
    for (const { hallId, raw } of capture.responses) {
      const hall = HALLS.find((h) => h.id === hallId);
      if (!hall) continue;
      for (const menu of normalizeHallDay(hall, raw, capture.date).menus) {
        if ((MEALS as readonly string[]).includes(menu.name)) {
          menus.push({ date: capture.date, hall: hall.name, meal: menu.name, items: menu.items });
        }
      }
    }
  }
  const order = (m: (typeof menus)[number]) =>
    `${m.date}|${HALLS.findIndex((h) => h.name === m.hall)}|${MEALS.indexOf(m.meal as never)}`;
  return menus.sort((a, b) => order(a).localeCompare(order(b)));
}

function evaluate(menus: ReturnType<typeof loadMenus>, targetSet: MacroTargets[]): Run[] {
  return menus.flatMap((menu) =>
    targetSet.map((targets) => {
      const plate = suggestPlate(menu.items, targets, DEFAULT_CONSTRAINTS);
      const macroError = Object.fromEntries(
        MACROS.map((k) => [k, Math.abs(plate.totals[k] - targets[k]) / (targets[k] > 0 ? targets[k] : 1)]),
      ) as Run["macroError"];
      return {
        date: menu.date,
        hall: menu.hall,
        meal: menu.meal,
        targets,
        deviation: plate.deviation,
        macroError,
        shortfall: plate.shortfall,
        servings: plate.selections.reduce((n, s) => n + s.servings, 0),
        totals: plate.totals,
        plate: plate.selections.map((s) => ({ name: s.item.name, category: s.item.category, servings: s.servings })),
      };
    }),
  );
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function quantile(xs: number[], q: number) {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

function summarize(runs: Run[]) {
  const dev = runs.map((r) => r.deviation);
  return {
    runs: runs.length,
    meanDeviation: mean(dev),
    medianDeviation: quantile(dev, 0.5),
    p90Deviation: quantile(dev, 0.9),
    maxDeviation: Math.max(...dev),
    perMacroMeanError: Object.fromEntries(MACROS.map((k) => [k, mean(runs.map((r) => r.macroError[k]))])),
    shortfalls: runs.filter((r) => r.shortfall !== null).length,
  };
}

test("optimizer eval", () => {
  const menus = loadMenus();
  expect(menus.length).toBeGreaterThan(0);
  const dates = [...new Set(menus.map((m) => m.date))];

  const results = Object.fromEntries(
    Object.entries(TARGET_SETS).map(([name, set]) => {
      const runs = evaluate(menus, set);
      return [name, { summary: summarize(runs), runs }];
    }),
  );

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    join(RESULTS_DIR, "optimizer-eval.json"),
    JSON.stringify({ dates, menus: menus.length, constraints: DEFAULT_CONSTRAINTS, targetSets: TARGET_SETS, results }, null, 2) + "\n",
  );

  const row = (name: string) => {
    const s = results[name].summary;
    const m = s.perMacroMeanError as Record<string, number>;
    return `| ${name} | ${s.runs} | **${pct(s.meanDeviation)}** | ${pct(s.medianDeviation)} | ${pct(s.p90Deviation)} | ${pct(s.maxDeviation)} | ${pct(m.calories)} | ${pct(m.protein_g)} | ${pct(m.carbs_g)} | ${pct(m.fat_g)} | ${s.shortfalls} |`;
  };
  const perMenu = results.default.runs
    .map((r) => `| ${r.date} | ${r.hall} | ${r.meal} | ${pct(r.deviation)} | ${r.servings} | ${r.shortfall ?? "—"} |`)
    .join("\n");

  const md = `# Optimizer Eval Results

Generated by \`npm run eval:optimizer\` from ${dates.length} captured day(s) (${dates.join(", ")}):
${menus.length} hall menus (Breakfast, Lunch, Dinner across ${HALLS.length} halls), run with
\`DEFAULT_CONSTRAINTS\` (≤ ${DEFAULT_CONSTRAINTS.maxItems} servings, ≤ ${DEFAULT_CONSTRAINTS.maxPerItem} per dish, ≥ ${DEFAULT_CONSTRAINTS.minCategories} stations).

**Metric:** the optimizer's own objective, \`deviation()\`: the mean over calories, protein,
carbs, and fat of |plate total − target| / target. 0% is an exact hit.

**Target sets:**
- \`default\`: the app's first-run targets (${DEFAULT_TARGETS.calories} kcal, ${DEFAULT_TARGETS.protein_g} g protein, ${DEFAULT_TARGETS.carbs_g} g carbs, ${DEFAULT_TARGETS.fat_g} g fat).
- \`grid\`: calories {500, 700, 900} × protein {30, 45, 60} g, with fat at 30% of calories and carbs taking the rest.

## Summary

| Target set | Runs | Mean error | Median | p90 | Max | Calories | Protein | Carbs | Fat | Shortfalls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${row("default")}
${row("grid")}

The per-macro columns are the mean relative error on that macro alone.

## Per Menu (default targets)

| Date | Hall | Meal | Error | Servings | Shortfall |
| --- | --- | --- | --- | --- | --- |
${perMenu}

## Caveats

- This is ${dates.length} day(s) of menus. Menus change daily, so add captures (\`npm run eval:capture\`) to tighten the estimate.
- Portions are the hall's listed serving sizes; real portions vary.
- The optimizer uses whole servings only (see \`src/domain/plate.ts\`), which puts a floor under achievable error.
`;
  writeFileSync(join(RESULTS_DIR, "optimizer-eval.md"), md);
});
