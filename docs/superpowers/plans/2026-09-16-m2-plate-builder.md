# UChicagoMacros M2 — Plate Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Given one hall's items for one meal period and a set of macro targets,
suggest a plate — a set of dishes with serving counts — that approximately hits
those targets, and let the user accept it into the existing manual plate.

**Architecture:** `src/domain/plate.ts` is a pure function,
`(items, targets, constraints) => Plate`. No React, no network, no
`localStorage`, no clock, no randomness. It is unit-testable against the same
captured fixtures M1 uses. The UI layer reads the result and writes it into the
existing `usePlate` store, which already owns persistence.

**Spec:** `docs/superpowers/specs/2026-08-29-dining-menu-app-design.md` §6

**Builds on:** M1 (menu viewer) and the manual plate builder, both shipped. The
manual plate — add, adjust servings in half-serving steps, remove, totals — is
already in `src/state/usePlate.ts` and `src/ui/PlatePanel.tsx`. M2 adds
suggestion, not a second plate.

---

## What is already true

These are constraints inherited from shipped code, not decisions to revisit.

- `MenuItem.macrosComplete` is `false` when any of calories / protein / fat /
  carbs is `null`. Spec §6 excludes those items from the optimizer. An item with
  unknown protein is not a zero-protein item.
- `usePlate` stores `PlateEntry[]` — `{ item: PlateItem, servings: number }` —
  keyed by `(date, hallId, period)`, with servings clamped to `[0.5, 20]` in
  half-serving steps. Anything the optimizer produces must survive the
  validation in `usePlate.read()` or it will be silently dropped on reload.
- `PlateItem` is a *snapshot*, not a reference. The optimizer works on live
  `MenuItem`s; the store snapshots them on write. That boundary already exists.

## Serving granularity

The optimizer emits **whole servings only**, even though the manual plate allows
half steps. Spec §6 defines integer counts `x_i ∈ [0, max_i]`, and a suggestion
of "1.5 servings of chicken" is advice the dining hall cannot act on. The user
can still nudge a suggested plate to half servings by hand afterward — that is
the manual control doing its job, not the optimizer's output.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/plate.ts` | The optimizer. Pure. Depends on `types` only. |
| `tests/plate-optimizer.test.ts` | Unit + constraint property tests. |
| `tests/suggest.test.tsx` | UI tests for the suggestion flow. |
| `src/ui/TargetForm.tsx` | Macro target inputs and the Suggest action. |
| `src/ui/PlatePanel.tsx` | Renders the form, applies a suggestion. |

`tests/plate.test.tsx` already covers the *manual* plate. Leave it alone; the
new files cover the optimizer and the suggestion UI, so a failure names which
part broke.

---

## Task 1: Types and constraint defaults

- [x] **Step 1: Add the optimizer's types to `src/domain/plate.ts`**

```ts
export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface PlateConstraints {
  maxItems: number;       // total servings across the plate, default 6
  maxPerItem: number;     // servings of any one dish, default 2
  minCategories: number;  // distinct stations represented, default 2
}

export interface PlateSelection {
  item: MenuItem;
  servings: number;       // integer >= 1
}

export interface SuggestedPlate {
  selections: PlateSelection[];
  totals: MacroTargets;
  /** Weighted relative deviation from target. 0 is exact. */
  deviation: number;
  /** Set when no plate could be built; `selections` is then empty. */
  shortfall: "no-complete-items" | "targets-unreachable" | null;
}
```

`MacroTargets` has no `null`s — a target the user did not set is not a target.
The UI supplies all four or the optimizer is not called.

- [x] **Step 2: Export the defaults as named constants**

`DEFAULT_CONSTRAINTS`. Spec §6 gives ≤ 6 items, ≤ 2 per item, ≥ 2 categories.
Name them so tests assert against the constant rather than a literal.

---

## Task 2: The objective function

- [x] **Step 1: Write `deviation(totals, targets)`**

Weighted mean of relative absolute error across the four macros:

```
deviation = mean over m of |totals[m] - targets[m]| / targets[m]
```

Relative, not absolute: 20 g off a 40 g protein target matters more than 20 kcal
off a 2000 kcal target, and an absolute objective would let calories dominate
the other three purely because its numbers are bigger.

A target of `0` would divide by zero. Guard it: treat a zero target as "any
amount above zero is fully wrong" and clamp the denominator to 1.

- [x] **Step 2: Test the objective directly**

An exact hit scores 0. Doubling every macro against every target scores 1.
The function is symmetric — overshooting by 10 and undershooting by 10 score
the same. Write these three before writing the search.

---

## Task 3: Greedy seed

- [x] **Step 1: Filter the candidate set**

Drop `macrosComplete === false`. If nothing survives, return an empty plate with
`shortfall: "no-complete-items"` — not an exception. A hall whose entire menu
lacks nutrition data is a normal Tuesday, not a bug.

- [x] **Step 2: Add servings greedily**

Starting from an empty plate, repeatedly add the single serving that most
reduces `deviation`, subject to the constraints, until no addition improves it
or `maxItems` servings are placed. Deterministic: on a tie, prefer the item
earlier in the input array, so the same menu always yields the same plate. A
suggestion that changes on every click reads as broken.

---

## Task 4: Local search

- [x] **Step 1: Improve the seed by swap / add / remove**

Spec §6: greedy seed plus local search over a swap / add / remove
neighbourhood. Iterate until no single move improves `deviation`, with a hard
iteration cap so a pathological menu cannot hang the browser. Keep the best
plate seen, not the last.

- [x] **Step 2: Enforce `minCategories` at the end, not during**

A two-category floor applied during greedy descent blocks good single-category
intermediate states. Apply it as a repair step: if the final plate has too few
distinct categories, force in the best-scoring item from an unused category and
re-run local search under that as a fixed constraint. If no such repair exists —
a menu with one station — return the plate and record
`shortfall: "targets-unreachable"` rather than returning nothing.

**Not in this milestone:** the spec's "at most one item from entrée-type
categories" constraint. It needs a classification of which stations count as
entrées, and the API returns station names as free text with no type field.
Guessing from name substrings would be wrong in ways users cannot see. The
remaining constraints already prevent the degenerate six-servings-of-one-dish
plate, which is what that rule was protecting against.

---

## Task 5: Tests

- [x] **Step 1: Property tests over the constraints**

Spec §7 requires these. For a range of targets and constraint settings against
the captured fixtures, assert of every returned plate:

- total servings ≤ `maxItems`
- every `servings` is an integer in `[1, maxPerItem]`
- every selected item appears in the input array (identity, not just name)
- no selected item has `macrosComplete === false`
- distinct categories ≥ `minCategories`, or `shortfall` is set
- `totals` equals the sum of `item macro × servings` over `selections`

- [x] **Step 2: Edge cases**

Empty input; every item incomplete; one item only; targets so small that the
smallest single serving overshoots; targets so large that `maxItems` servings
cannot reach them. Each returns a well-formed plate, never a throw.

- [x] **Step 3: Determinism**

The same input twice returns identical output. Assert on the selection ids in
order, not just on the totals.

- [x] **Step 4: Quality, not just legality**

A plate that satisfies every constraint and hits nothing is legal and useless.
On the Baker fixture with a realistic target, assert `deviation` is below a
threshold. Pick the threshold from an observed run and comment the number it
actually scored, so a later regression is visible as a regression.

---

## Task 6: Wire the UI

- [x] **Step 1: `TargetForm.tsx`**

Four number inputs and a Suggest button. Labelled, keyboard reachable, matching
the existing panel's markup conventions. Targets persist per browser, not per
hall and meal — a protein goal is a property of the person, not the dining hall.
Use a separate `localStorage` key from the plate; do not widen `usePlate`'s
stored shape, which has a validating reader that would reject the change.

- [x] **Step 2: Apply into the existing plate**

Suggest replaces the current plate for that hall and meal. Replacing silently
would destroy manual work, so confirm first when the plate is non-empty.

- [x] **Step 3: Render the outcome**

Show the resulting totals against the targets, and how far off. When `shortfall`
is set, say which case it was in plain words — "no dishes here have full
nutrition data" reads better than an empty panel that looks broken.

- [x] **Step 4: UI tests in `tests/suggest.test.tsx`**

Suggest fills the plate; targets persist across remount; the shortfall states
render. Follow the existing navigation tests' controlled-state pattern.

---

## Task 7: Verify and ship

- [x] **Step 1: Full suite**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [x] **Step 2: Update the README**

The "Next" section currently promises automatic suggestions. Move them into the
body and state the constraint defaults and the whole-servings rule, so the
documented behaviour matches what shipped.

---

## Done when

- `suggestPlate` is pure, deterministic, and has no React or I/O import
- Every property test in Task 5 passes against the captured fixtures
- Items with incomplete macros never appear in a suggestion
- A user can set four targets, press Suggest, and get an editable plate back
- Targets survive a reload; a non-empty plate is never replaced without consent
- `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` are clean

## Implementation notes

Two things this plan did not anticipate, decided while building and pinned by
tests so they are not re-litigated by accident:

1. **An empty plate is not repaired up to the category floor.** When every dish
   moves the total further from the target — targets smaller than the smallest
   serving — the search correctly returns nothing. Running the category repair
   on that would force in two dishes nobody asked for and score *worse* than
   suggesting nothing. Empty plates now short-circuit to
   `shortfall: "targets-unreachable"`.
2. **The two-station floor can beat an exact single-dish hit.** With a target
   one dish matches exactly, the suggestion still adds a second from another
   station and lands further from target. This is spec §6 working as intended —
   a plate is a meal, not a side — and is asserted explicitly in
   `tests/suggest.test.tsx` so it reads as a decision rather than a bug.

The optimizer verifies each macro is non-null itself rather than trusting
`macrosComplete`. The flag is owned by `normalize.ts`; the optimizer sums the
numbers, so it checks the numbers.

## Deliberately not in M2

Allergen and dietary filters, share-a-plate links, and cross-hall suggestion
(optimizing over all four halls at once). The entrée-category constraint is
deferred with a reason, in Task 4. Menu history, accounts, and logging remain
non-goals — spec §10.
