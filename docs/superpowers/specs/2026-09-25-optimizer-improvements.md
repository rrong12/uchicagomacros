# UChicagoMacros — Optimizer Improvements

**Date:** 2026-09-25
**Owner:** Zhikang (Robert) Rong
**Status:** Proposed. No implementation started. Deferred on purpose; pick this up
when the engine is next worked on.

**Depends on:** the optimizer eval (`docs/superpowers/plans/2026-09-25-optimizer-eval.md`,
results in `eval/results/optimizer-eval.md`). Every proposal below is measured with it.

---

## 1. What the eval found

On the first capture (2026-09-25, 12 hall menus), `suggestPlate` with
`DEFAULT_CONSTRAINTS`:

| Meal | Mean error (grid) | Fat error (grid) | Fat misses: over / under |
| --- | --- | --- | --- |
| Breakfast | 5.3% | 6.0% | 13 / 3 |
| Lunch | **10.1%** | **25.1%** | **35 / 0** |
| Dinner | 4.9% | 8.8% | 25 / 5 |

At the default targets, lunch at Baker, Cathey, and Bartlett scores about 20%. Every fat
miss at lunch overshoots. Two example plates:

- Baker lunch: Apple Crisp + Roast Beef + Sliced Mushrooms → 890 kcal / 40 g / 93 g /
  **41 g fat** vs a 25 g target.
- Cathey lunch: Grilled Chicken + Apple Crisp + 2× Sliced Mushrooms + 2× Grated Parmesan.

## 2. The cause: search, not the menu

A throwaway experiment (random-restart hill climbing, 150 starts, same constraints, same
objective) found plates within **0.5–1.9% on every menu**, including the lunches:

| Meal | Shipped (default targets) | Best found |
| --- | --- | --- |
| Breakfast | 2.6–3.0% | 1.5–1.9% |
| Lunch | 4.2–20.1% | **1.2–1.6%** |
| Dinner | 5.7–6.2% | 0.5–1.5% |

The menus do contain good plates. The greedy seed commits early to a high-fat carb source
(Apple Crisp), and swap/add/remove local search can't climb out of that basin. This
experiment was not committed; section 3.1 makes it a real baseline.

## 3. Proposals, in recommended order

### 3.1 Add an optimality baseline to the eval (do first)

Add a slow, exhaustive or near-exhaustive reference solver to the eval only. It never
ships. Candidates: a small ILP (bounded integer servings, category floor, and an
absolute-deviation objective linearized per macro), or seeded random-restart search with
many starts. Report the **gap** (shipped minus best) per menu.

- Why first: it turns "is the optimizer good?" into a number, and spec §6 already asks
  for a before/after comparison before any ILP.
- Done when: `optimizer-eval.md` shows shipped, baseline, and gap columns.

### 3.2 Deterministic multi-start search (the likely fix)

Keep greedy plus local search, but run it from several seeds and keep the best result.
Examples: seed from each of the top-k single dishes by score, or from each station's best
dish. It stays deterministic (no randomness, and ties still break by input order), which
the tests require.

- Expected: most of the lunch gap closes, since the experiment shows good plates are
  reachable from other starting points.
- Cost: k times the runtime. It runs on click over about 150 items, so measure latency and
  keep it under about 50 ms on a phone.

### 3.3 Richer moves: 2-swap or perturbation

If multi-start leaves a gap, add a 2-for-2 swap move, or a kick-and-reoptimize step when
stuck. Measure it against 3.2 with the eval; add it only if the gap closes meaningfully.

### 3.4 Plates should be meals

Low error isn't the whole goal. "Apple Crisp + Roast Beef + Sliced Mushrooms" or
"2× Grated Parmesan" hits numbers but isn't a meal. This is what the M4 dish-type
classifier in the applied-AI spec is for (require an entrée, cap condiments and
toppings). Once M4 lands, the eval should also report the share of plates that meet the
meal constraints, so accuracy and realism are tracked together.

### 3.5 More captures

One day of menus is a thin sample. Capture a week or two, including weekends, with
`npm run eval:capture`. Weekend menus differ. Run by hand; spec §2.2 rules out automation.

### 3.6 Regression gate in CI

Once 3.2 lands, have CI run `npm run eval:optimizer` against the committed captures and
fail if mean error regresses past a threshold. It's offline and deterministic, so it's
safe in CI.

### 3.7 Half servings (investigate, low priority)

Whole servings put a floor under error. Measure how much half servings would buy, but
keep the product decision in `plate.ts` ("1.5 servings of chicken is advice a dining hall
cannot act on") unless the gain is large.

## 4. Deliberately not proposed

- Changing the objective to hide fat error, e.g. by down-weighting fat. The eval shows
  the plates really are off, and better search closes the gap without it.
- Any server-side or scheduled capture (spec §2.2).
