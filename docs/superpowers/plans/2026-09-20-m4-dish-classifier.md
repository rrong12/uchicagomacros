# UChicagoMacros M4 — Dish Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label every dish entrée / side / dessert / beverage / condiment, ship
the labels as a static artifact, and use them to enforce the entrée constraint
the optimizer was forced to skip.

**Spec:** `docs/superpowers/specs/2026-09-20-applied-ai-design.md` §2.1, §4.1, §6.1

**Shape:** offline script → committed JSON → bundled into the app. No server, no
runtime API call, no key in the browser, no per-visit cost. This milestone can
ship and be reverted independently of anything in M5.

**Before starting:** read the spec's §2.3 and §10. No part of this touches
allergens.

---

## Why an artifact rather than a runtime call

Classification is a pure function of (dish name, ingredients). Dishes repeat
across days and halls. The answer never changes. Anything with those three
properties belongs in a build-time artifact, not a request path — and keeping it
out of the browser is also what keeps the API key out of the browser.

The cost of the artifact is staleness: a dish added today is unlabelled until
the next run. Task 5 handles that by treating unknown as unconstrained.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/classify-dishes.mjs` | Offline Batch API run. Not bundled. |
| `src/data/dish-types.json` | Committed artifact: dish key → type. |
| `src/domain/dishtype.ts` | Types, the lookup, the key function. Pure. |
| `src/domain/plate.ts` | Consume the constraint. |
| `evals/dish-types/` | Labelled sample, runner, results. |
| `tests/dishtype.test.ts` | Lookup, key stability, unknown handling. |

`scripts/` already exists and is excluded from the app bundle — `probe-allergens.js`
lives there. Keep the classifier alongside it.

---

## Task 1: The type taxonomy and the lookup key

- [ ] **Step 1: Define `DishType` in `src/domain/dishtype.ts`**

```ts
export type DishType =
  | "entree" | "side" | "dessert" | "beverage" | "condiment" | "unknown";
```

`unknown` is a real member, not an error case. Every lookup miss returns it and
every consumer must handle it.

- [ ] **Step 2: Define the artifact key, and make it stable**

Key on a normalized dish **name**, not `item.id`. The API's ids are per-day
menu-record ids, so the same dish gets a new one tomorrow and a key built on it
would miss on every subsequent run — the artifact would grow forever and never
hit.

Normalize by lowercasing and collapsing whitespace. Do not strip punctuation or
stem: "Chicken Sandwich" and "Chicken Sandwiches" being separate entries costs
one extra classification and avoids collapsing two genuinely different dishes.

Export `dishKey(name: string): string` and use it on both the write and read
side, so the script and the app cannot disagree.

- [ ] **Step 3: Ship a typed loader**

`lookupDishType(name: string): DishType`, reading the imported JSON. Pure, no
I/O. Keep the JSON import in this one module so nothing else depends on the
artifact's shape.

---

## Task 2: The offline classifier

- [ ] **Step 1: Collect distinct dishes**

Input is captured menu JSON — the existing fixtures plus anything saved from a
browser run. The script must not fetch from Dine On Campus: spec §2.2, a
datacenter IP gets a Cloudflare 403, and this script runs from a laptop or CI.
Read files, do not fetch.

Deduplicate by `dishKey`. **Skip any key already present in the artifact** so
re-runs only pay for new dishes.

- [ ] **Step 2: Classify via the Batch API**

Nothing here is latency-sensitive and batch is half price. Use
`client.messages.batches.create(...)` with one request per dish and a
`custom_id` carrying the dish key, poll `processing_status` until `"ended"`,
then stream results.

**Results arrive in any order — key by `custom_id`, never by position.** Handle
the per-result `.result.type` of `errored` / `canceled` / `expired` by leaving
that dish out of the artifact rather than writing a wrong label.

- [ ] **Step 3: Use structured outputs**

`output_config: {format: {...}}` with a schema of `{type, confidence}`. Not the
deprecated `output_format`, and not prose. The point of this boundary is that it
is typed.

Model: `claude-opus-5`, `output_config: {effort: "low"}` — per-dish
classification is not reasoning-heavy. Leave adaptive thinking on; do **not**
set `thinking: {type: "disabled"}` (spec §4.1 explains the two failure modes).
`max_tokens` around 256.

- [ ] **Step 4: Write the artifact deterministically**

Sort keys before writing. An unsorted artifact produces a meaningless diff on
every run and hides real changes in the noise.

Record `confidence`, and write anything below threshold as `unknown` rather than
a coin-flip label. A wrong entrée label actively degrades plates; an unknown one
merely fails to improve them.

- [ ] **Step 5: Document how to run it**

It needs a key and costs money. Both belong in a header comment, along with the
observed cost of a full run. Never read the key from anywhere but the
environment, and never commit one.

---

## Task 3: Evaluate before wiring it in

Do this **before** Task 4. A classifier that does not work should not reach
`plate.ts`.

- [ ] **Step 1: Hand-label ~150 dishes**

Stratify across all four halls and every period. Commit the labels under
`evals/dish-types/`. Split train/test and keep test untouched while tuning.

- [ ] **Step 2: Score it**

Overall accuracy plus the confusion matrix. Watch the entrée/side boundary
specifically — it is where errors concentrate and the only one the optimizer
depends on.

- [ ] **Step 3: Try a cheaper model on the same split**

Spec §4 defaults to Opus 5 but says the substitution is a measured question.
Run Sonnet 5 and Haiku 4.5 against the same test split and record all three. If
a cheaper model matches, take it — and record the number that justified it.

- [ ] **Step 4: Stop if it does not work**

If test accuracy on the entrée boundary is poor, the honest outcome is to write
that down and not ship the constraint. Say so in the eval notes rather than
wiring in a classifier that makes plates worse.

---

## Task 4: Use it in the optimizer

- [ ] **Step 1: Add `maxEntrees` to `PlateConstraints`, defaulting to 1**

Spec §6 of the base spec: "at most one item from entrée-type categories".

- [ ] **Step 2: Enforce it in the search**

Unlike `minCategories`, this is a ceiling, so it can be checked during descent
rather than repaired after — a plate that already has an entrée simply cannot
add another. Extend the existing `canAdd` guard.

- [ ] **Step 3: Unknown means unconstrained**

A dish whose type is `unknown` never counts against `maxEntrees`. Counting it
would make an unlabelled dish invisible to the optimizer, which is the "missing
data is not zero" rule from the base spec in a different costume.

- [ ] **Step 4: Extend the property tests**

`tests/plate-optimizer.test.ts` already asserts every constraint on every
returned plate. Add `maxEntrees` to that list. The existing determinism and
edge-case tests must keep passing unchanged.

- [ ] **Step 5: Measure the plates, not just the classifier**

Re-run the fixture suggestions with and without the constraint. Record the
deviation from `plate.ts` both ways, plus a written judgement of whether each
plate reads as a meal. Deviation will likely get slightly *worse* — that is
expected and is the trade: a more edible plate that matches the target a little
less well. Write the numbers down so the trade is visible rather than assumed.

---

## Task 5: Surface it honestly

- [ ] **Step 1: Do not display the labels as facts**

These are heuristics for making plates look like meals, not nutritional truth.
Whether a burrito is an entrée is a judgement. If the UI shows the type at all,
it should not look like it came from the dining hall.

- [ ] **Step 2: README**

Say the labels are model-generated, when they were generated, and that unknown
dishes are unconstrained rather than excluded.

---

## Task 6: Verify

- [ ] **Step 1**

```bash
npm test && npx tsc -b && npm run lint && npm run build
```

`tsc -b` is the real typecheck — `tsc --noEmit` alone does not cover the test
project, which is how a broken test helper reached a green `vitest` run during
M3.

- [ ] **Step 2: Confirm the artifact is bundled and the script is not**

Check the built output: `dish-types.json` should be in it, `scripts/` should not.

---

## Done when

- `scripts/classify-dishes.mjs` runs, skips already-known dishes, and writes a
  sorted, deterministic artifact
- Test-split accuracy is recorded for at least two models, with the chosen one
  justified by a number
- The entrée constraint holds on every plate in the property tests
- An unknown dish is never excluded from a suggestion
- Plate quality before/after is written down, deviation included
- `npm test`, `tsc -b`, `oxlint`, `npm run build` clean

## Deliberately not in M4

The natural-language parser and its proxy — that is M5, and it needs a server
this milestone deliberately avoids. No model output touches allergens (spec
§2.3, §10). No runtime model calls of any kind.
