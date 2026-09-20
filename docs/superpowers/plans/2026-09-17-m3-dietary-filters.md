# UChicagoMacros M3 — Dietary Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the user narrow a hall's menu to the dining hall's own dietary
labels — Vegetarian, Vegan, Avoiding Gluten — and see each dish's allergen tags
on its card.

**Spec:** `docs/superpowers/specs/2026-08-29-dining-menu-app-design.md` §2.7, §8 (M3)

**Why this is cheap:** the data already ships. Every item carries a typed
`filters[]` array of `label` and `allergen` entries (§2.7). No new request, no
ingredient-string parsing, no upstream unknowns for the label half.

---

## The safety boundary, which is the whole design

This milestone **filters on labels** and **displays allergens**. It does not
filter on allergens, and it never states that a dish lacks one.

- A `label` (`Vegetarian`, `Vegan`, `Avoiding Gluten`) is a **positive claim the
  dining hall published**. Filtering to it shows the user what the vendor
  labelled. That is honest as long as the copy says so.
- An `allergen` tag is also a positive claim — "this contains milk". But the
  *absence* of a tag is not a claim that the dish is free of it, and we have no
  way to tell a true absence from an untagged dish.
- Worse, **the `*` suffix is undecoded** (§2.7). The likely reading is
  trace/may-contain, but it is inferred from 11 instances on one day. Building
  an "exclude milk" filter on that would tell someone with a dairy allergy a
  dish is safe on the strength of a guess.

So: allergens render as informational badges, starred ones visibly distinct, and
the panel says the data comes from the dining hall and is not a safety
guarantee. An allergen *exclusion* filter waits for confirmation from Dine On
Campus (§9).

**Do not "improve" this later by adding allergen exclusion without that
confirmation.** It looks like a small symmetric feature and is not.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/types.ts` | `Allergen`, plus `labels` / `allergens` on `MenuItem`. |
| `src/domain/normalize.ts` | Parse `filters[]`. Owns the `*` split. |
| `src/domain/filter.ts` | Label filtering. Pure. |
| `src/ui/DietaryFilter.tsx` | Label toggle chips. |
| `src/ui/ItemRow.tsx` | Allergen badges. |
| `src/ui/HallCard.tsx` | Apply the label filter; empty-state copy. |
| `src/App.tsx` | Selected-label state. |
| `tests/dietary.test.ts` | Normalization and filtering, against the fixture. |
| `tests/dietary-ui.test.tsx` | Chips, badges, empty state. |

---

## Task 1: Model the data

- [x] **Step 1: Add `Allergen` to `types.ts`**

```ts
export interface Allergen {
  /** Name with any trailing `*` stripped: "Milk*" -> "Milk". */
  name: string;
  /**
   * True when the API starred the name. The meaning is UNCONFIRMED — read as
   * "may contain" and never as a basis for asserting absence. See spec §2.7.
   */
  trace: boolean;
}
```

- [x] **Step 2: Extend `MenuItem`**

`labels: string[]` and `allergens: Allergen[]`. Both default to `[]`, never
`null` — an item with no tags is a normal item, and `[]` needs no null guard at
every call site. This is different from macros, where `null` carries the real
meaning "not reported"; here the distinction between "no tags" and "tags not
reported" is not one the API lets us make, so it is not one we model.

---

## Task 2: Parse `filters[]`

- [x] **Step 1: Split by `type` in `normalize.ts`**

`type: "label"` appends to `labels`; `type: "allergen"` appends to `allergens`,
splitting a trailing `*` into `trace: true`. Preserve API order — it is stable
and sorting adds nothing.

- [x] **Step 2: Warn once on an unknown `type`**

Reuse the `warned` set pattern `normalize.ts` already uses for nutrient names.
An upstream rename should surface, not silently drop tags.

- [x] **Step 3: Deduplicate**

If an item ever lists the same allergen starred *and* unstarred, keep the
**unstarred** one — the stronger claim. The fixture has zero such cases, so
this is defensive, but the alternative is showing one dish two contradictory
ways.

---

## Task 3: Filter on labels

- [x] **Step 1: Add `labels?: string[]` to `FilterOptions`**

An item matches when it carries **every** selected label. Selecting Vegan and
Avoiding Gluten means both, not either — a user excluding things wants the
intersection.

- [x] **Step 2: Match exactly, not case-insensitively**

The names come from a fixed vendor vocabulary and are echoed straight back into
the chips, so a case mismatch cannot arise from user input. Loose matching here
would only hide an upstream rename that we want to see.

---

## Task 4: UI

- [x] **Step 1: `DietaryFilter.tsx` — chips for labels present in this menu**

Derive the chip list from the current period's items, not a hardcoded set.
Hardcoding would show a Vegan chip that matches nothing on a day with no vegan
dishes, and would silently miss a label the vendor adds later. Include a count
per chip, and only render the row when there is at least one label.

- [x] **Step 2: Allergen badges in `ItemRow`**

Render `item.allergens`. Mark starred ones distinctly — not with a bare `*`,
which means nothing to a reader. Use "may contain" wording and an accessible
label, since a purely visual distinction fails a screen reader.

- [x] **Step 3: Apply in `HallCard`, and fix the empty state**

The existing "No matching dishes" copy assumes a search term. With filters it
must distinguish "no search match", "no dishes with these labels", and both at
once — otherwise a user with a Vegan chip active and an empty search is told to
try a different food name.

- [x] **Step 4: Selection state in `App.tsx`**

Selected labels reset when the hall or period changes: a label that existed on
one menu may not exist on the next, and a stale active filter that matches
nothing reads as a broken app. Do not persist them — unlike macro targets, this
is a per-browse choice.

---

## Task 5: Tests

- [x] **Step 1: Normalization, against the real fixture**

The captured Baker response has labels on 20/20 items and both starred and
unstarred allergens, so assert against it rather than synthetic data: Vegetarian
count, a known starred allergen parsing to `trace: true` with the `*` stripped,
and an unstarred one to `trace: false`.

- [x] **Step 2: Unknown `type` warns once and drops nothing else**

- [x] **Step 3: Label filtering is AND, and is pure**

Including the no-labels-selected case returning everything, and no input
mutation.

- [x] **Step 4: UI**

Chips derive from the menu; clicking narrows the list; badges render with the
may-contain wording; each empty state shows the right copy.

---

## Task 6: Verify

- [x] **Step 1**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [x] **Step 2: README**

Document label filtering and the allergen-display boundary, including that
absence of a tag is not a claim.

---

## Done when

- Chips reflect the labels actually present, with counts
- Selecting labels narrows the menu by intersection; clearing restores it
- Allergen badges render, with starred ones distinct visually *and* to a screen
  reader
- Empty states tell search and filter apart
- No code path treats a missing allergen tag as absence
- `npm test`, `tsc --noEmit`, `oxlint`, `npm run build` clean

## Deliberately not in M3

**Allergen exclusion filtering** — blocked on confirming `*`, see the safety
boundary above. Share-a-plate links. Cross-hall suggestion. Feeding labels into
the plate optimizer as constraints (worth doing, but it changes `plate.ts`'s
signature and belongs with its own tests).
