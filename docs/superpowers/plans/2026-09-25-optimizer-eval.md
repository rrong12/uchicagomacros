# Optimizer Eval — Implementation Plan

**Goal:** Make the plate optimizer's accuracy a reproducible, committed number.
Run `suggestPlate` over real captured menus and a fixed set of macro targets,
and report how far its plates land from the targets.

**Why now:** The optimizer's accuracy is cited outside the repo (a résumé bullet:
"3.3% mean error across calories, protein, carbs, and fat on live menus"), and
nothing in the repo reproduces that number. A claim with no reproduction path
can't be defended or tracked as the optimizer changes.

**Architecture:**

- **Capture** runs in a real browser because of spec §2.2: the v1 API returns
  403 to anything that isn't one. `eval/capture.html` is a dev-only page that
  reuses `src/api/client.ts` and `src/domain/halls.ts`, fetches every hall and
  period for one date, and dumps the raw v1 responses unmodified.
  `eval/capture.sh` serves it with Vite, drives it with headless Chrome, and
  writes `eval/menus/<date>.json`. The build never includes it, because Vite's
  build input is `index.html` only.
- **Eval** is pure and offline. `eval/optimizer.eval.ts` normalizes the captures
  with `normalizeHallDay` (the app's own parser), takes each hall's Breakfast,
  Lunch, and Dinner menus, and runs `suggestPlate` with `DEFAULT_CONSTRAINTS`
  against the target set. It uses its own Vitest config so `npm test` never
  runs it.
- **Output:** `eval/results/optimizer-eval.md` (human-readable) and
  `eval/results/optimizer-eval.json` (machine-readable), both committed.

**Metric:** the optimizer's own objective, `deviation()`: the mean over the four
macros of |total − target| / target. This is exactly the "mean error across
calories, protein, carbs, and fat" the résumé describes.

**Target set (fixed, documented):**

- The app's `DEFAULT_TARGETS` (800 kcal, 40 g protein, 90 g carbs, 25 g fat).
  This is what a first-time user sees, so it's reported as its own headline.
- A 3×3 grid: calories {500, 700, 900} × protein {30, 45, 60} g. Fat is 30% of
  calories (÷ 9). Carbs take the remaining calories (÷ 4).

## Files

| File | Change |
| --- | --- |
| `eval/capture.html` | New. Dev-only browser capture page |
| `eval/capture.sh` | New. Runs Vite and headless Chrome, writes a capture |
| `eval/menus/2026-09-25.json` | New. First capture (raw v1 responses) |
| `eval/optimizer.eval.ts` | New. The eval |
| `eval/vitest.config.ts` | New. Isolates the eval from `npm test` |
| `eval/results/optimizer-eval.{md,json}` | New. Generated results |
| `package.json` | Add `eval:capture` and `eval:optimizer` scripts |
| `README.md` | Short "Optimizer accuracy" section linking the results |

## Tasks

- [x] **1. Prove headless capture works.** A plain headless Chrome fetch fails
  ("Failed to fetch"). With a normal desktop Chrome user agent it succeeds: 22
  responses (4 halls, every period) for 2026-09-25.
- [x] **2. Capture script.** `eval/capture.sh [date]` starts Vite on a spare
  port, runs Chrome with `--dump-dom`, extracts the JSON, validates it, and
  writes `eval/menus/<date>.json`. It fails loudly on any error.
- [x] **3. Eval.** Load every capture, normalize it, run the target set, and
  compute per-run deviation, per-macro relative error, and shortfall. Aggregate
  mean, median, and p90. Write the md and json results.
- [x] **4. Wire it up.** npm scripts, README section.
- [x] **5. Verify.** `npm test && npx tsc --noEmit && npm run lint && npm run build`
  clean, the eval reproduces identical results on a second run (it's
  deterministic), and the build output doesn't contain `eval/`.

## Done when

- `npm run eval:optimizer` regenerates the committed results byte-for-byte.
- The README states the measured number and links the method.
- The full gate is clean.

## Deliberately not in this milestone

- A scheduled capture. Spec §2.2 rules out any server or cron fetching the API.
  Captures are run by hand from a real machine.
- Changing the optimizer. This measures it as shipped.
- Per-user dietary filters in the eval. It uses full menus, which is also what
  the UI passes to `suggestPlate` by default.

## Implementation Notes

- `tsconfig.app.json` now includes `eval/`, so `tsc -b` (part of `npm run build` and CI)
  typechecks the eval. The plan didn't list this, but without it the gate would never
  check `eval/`.
- First results (2026-09-25): mean error 8.2% at the default targets and 6.7% on the
  grid; medians 5.7% and 4.8%. Breakfast is about 2.6–3.0% at every hall. Lunch at
  Baker, Cathey, and Bartlett is about 20% and drives the mean. Fat is the hardest
  macro. The résumé's "3.3%" doesn't hold as a mean on this capture (32 of 108 grid
  runs reach it). Lunch is the lead for any optimizer work.
- The results JSON records each plate's totals and dishes, so a bad run can be diagnosed
  without rerunning. That's how the lunch fat overshoot was traced to the greedy seed. Next
  steps: `docs/superpowers/specs/2026-09-25-optimizer-improvements.md`.
