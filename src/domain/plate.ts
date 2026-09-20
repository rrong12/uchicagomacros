import type { MenuItem } from "./types";

/**
 * Macro targets for one meal. No nulls: a target the user did not set is not a
 * target, so the UI supplies all four or does not call the optimizer.
 */
export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface PlateConstraints {
  /** Total servings across the whole plate. */
  maxItems: number;
  /** Servings of any one dish. */
  maxPerItem: number;
  /** Distinct stations the plate must draw from. */
  minCategories: number;
}

export interface PlateSelection {
  item: MenuItem;
  /** Whole servings only — see the note on granularity below. */
  servings: number;
}

export type PlateShortfall = "no-complete-items" | "targets-unreachable";

export interface SuggestedPlate {
  selections: PlateSelection[];
  totals: MacroTargets;
  /** Weighted relative deviation from target. 0 is an exact hit. */
  deviation: number;
  /** Why the plate is not what was asked for, or null when it is. */
  shortfall: PlateShortfall | null;
}

/** Spec §6: at most 6 servings, at most 2 of one dish, at least 2 stations. */
export const DEFAULT_CONSTRAINTS: PlateConstraints = {
  maxItems: 6,
  maxPerItem: 2,
  minCategories: 2,
};

const MACRO_KEYS = ["calories", "protein_g", "carbs_g", "fat_g"] as const;
type MacroKey = (typeof MACRO_KEYS)[number];

/**
 * The optimizer emits whole servings only, even though the manual plate allows
 * half steps. "1.5 servings of chicken" is advice a dining hall cannot act on.
 * The user can still nudge a suggestion to half servings by hand afterward.
 */
const MIN_SERVINGS = 1;

/** Local search runs to a fixed point; the cap only bounds pathological menus. */
const MAX_LOCAL_SEARCH_ROUNDS = 200;

const ZERO_TOTALS: MacroTargets = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
};

/**
 * Weighted mean relative error across the four macros.
 *
 * Relative rather than absolute: 20 g off a 40 g protein target matters far
 * more than 20 kcal off a 2000 kcal one, and an absolute objective would let
 * calories dominate the other three purely because its numbers are bigger.
 */
export function deviation(
  totals: MacroTargets,
  targets: MacroTargets,
): number {
  let sum = 0;
  for (const key of MACRO_KEYS) {
    // A zero target would divide by zero. Clamp the denominator to 1 so any
    // amount above zero reads as fully wrong rather than as infinity.
    const denominator = targets[key] > 0 ? targets[key] : 1;
    sum += Math.abs(totals[key] - targets[key]) / denominator;
  }
  return sum / MACRO_KEYS.length;
}

/** A candidate is an item with its macros proven non-null, so totals are safe. */
interface Candidate {
  item: MenuItem;
  /** Position in the caller's input array. Breaks ties deterministically. */
  index: number;
  macros: Record<MacroKey, number>;
}

function toCandidate(item: MenuItem, index: number): Candidate | null {
  if (!item.macrosComplete) return null;
  const macros = {} as Record<MacroKey, number>;
  for (const key of MACRO_KEYS) {
    const value = item[key];
    // macrosComplete already guarantees this, but the optimizer sums these
    // numbers directly — re-check rather than assert a flag another module owns.
    if (value === null || !Number.isFinite(value)) return null;
    macros[key] = value;
  }
  return { item, index, macros };
}

/** Servings per candidate index. Absent means zero. */
type Counts = Map<number, number>;

function totalServings(counts: Counts): number {
  let total = 0;
  for (const n of counts.values()) total += n;
  return total;
}

function totalsFor(counts: Counts, candidates: Candidate[]): MacroTargets {
  const totals = { ...ZERO_TOTALS };
  for (const [index, servings] of counts) {
    const { macros } = candidates[index];
    for (const key of MACRO_KEYS) totals[key] += macros[key] * servings;
  }
  return totals;
}

function categoriesIn(counts: Counts, candidates: Candidate[]): Set<string> {
  const categories = new Set<string>();
  for (const index of counts.keys()) {
    categories.add(candidates[index].item.category);
  }
  return categories;
}

function score(
  counts: Counts,
  candidates: Candidate[],
  targets: MacroTargets,
): number {
  return deviation(totalsFor(counts, candidates), targets);
}

function addServing(counts: Counts, index: number): Counts {
  const next = new Map(counts);
  next.set(index, (next.get(index) ?? 0) + 1);
  return next;
}

function removeServing(counts: Counts, index: number): Counts {
  const next = new Map(counts);
  const current = next.get(index) ?? 0;
  if (current <= 1) next.delete(index);
  else next.set(index, current - 1);
  return next;
}

function canAdd(
  counts: Counts,
  index: number,
  constraints: PlateConstraints,
): boolean {
  if (totalServings(counts) >= constraints.maxItems) return false;
  return (counts.get(index) ?? 0) < constraints.maxPerItem;
}

/**
 * Greedy descent: repeatedly place the single serving that most reduces
 * deviation, stopping when no addition improves it.
 *
 * Ties go to the earlier item in the caller's input array, so the same menu
 * always yields the same plate. A suggestion that changes on every click reads
 * as broken even when each individual answer is defensible.
 */
function greedySeed(
  candidates: Candidate[],
  targets: MacroTargets,
  constraints: PlateConstraints,
): Counts {
  let counts: Counts = new Map();
  let best = score(counts, candidates, targets);

  for (let placed = 0; placed < constraints.maxItems; placed++) {
    let bestIndex = -1;
    let bestScore = best;
    for (const { index } of candidates) {
      if (!canAdd(counts, index, constraints)) continue;
      const candidateScore = score(
        addServing(counts, index),
        candidates,
        targets,
      );
      if (candidateScore < bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) break;
    counts = addServing(counts, bestIndex);
    best = bestScore;
  }
  return counts;
}

/**
 * Improve a seed over the swap / add / remove neighbourhood until no single
 * move helps. `locked` indices are never removed — the category repair step
 * uses that to hold an item in place while the rest of the plate rearranges.
 */
function localSearch(
  seed: Counts,
  candidates: Candidate[],
  targets: MacroTargets,
  constraints: PlateConstraints,
  locked: ReadonlySet<number> = new Set(),
): Counts {
  let current = seed;
  let currentScore = score(current, candidates, targets);

  for (let round = 0; round < MAX_LOCAL_SEARCH_ROUNDS; round++) {
    let bestMove: Counts | null = null;
    let bestScore = currentScore;

    const consider = (next: Counts) => {
      const nextScore = score(next, candidates, targets);
      if (nextScore < bestScore) {
        bestScore = nextScore;
        bestMove = next;
      }
    };

    for (const { index } of candidates) {
      if (canAdd(current, index, constraints)) consider(addServing(current, index));
    }
    for (const index of [...current.keys()].sort((a, b) => a - b)) {
      const atMinimum = locked.has(index) && (current.get(index) ?? 0) <= 1;
      if (atMinimum) continue;
      const removed = removeServing(current, index);
      consider(removed);
      // Swap: free one serving, then spend it on a different dish.
      for (const { index: other } of candidates) {
        if (other === index) continue;
        if (canAdd(removed, other, constraints)) {
          consider(addServing(removed, other));
        }
      }
    }

    if (bestMove === null) break;
    current = bestMove;
    currentScore = bestScore;
  }
  return current;
}

/**
 * Bring a plate up to `minCategories` distinct stations.
 *
 * Applied as a repair rather than enforced during descent: a category floor
 * checked on every intermediate state blocks good single-category paths to
 * good multi-category plates. Returns null when the menu itself cannot satisfy
 * the floor.
 */
function repairCategories(
  counts: Counts,
  candidates: Candidate[],
  targets: MacroTargets,
  constraints: PlateConstraints,
): Counts | null {
  let current = counts;
  const locked = new Set<number>();

  while (categoriesIn(current, candidates).size < constraints.minCategories) {
    const used = categoriesIn(current, candidates);
    let bestIndex = -1;
    let bestScore = Infinity;

    for (const { index, item } of candidates) {
      if (used.has(item.category)) continue;
      // Force room by dropping the least useful serving if the plate is full.
      const base = makeRoomFor(current, candidates, targets, constraints, locked);
      if (base === null) continue;
      const candidateScore = score(addServing(base, index), candidates, targets);
      if (candidateScore < bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) return null;

    const base = makeRoomFor(current, candidates, targets, constraints, locked);
    if (base === null) return null;
    current = addServing(base, bestIndex);
    locked.add(bestIndex);
    current = localSearch(current, candidates, targets, constraints, locked);
  }
  return current;
}

/** Free one serving slot, dropping whichever removal hurts the score least. */
function makeRoomFor(
  counts: Counts,
  candidates: Candidate[],
  targets: MacroTargets,
  constraints: PlateConstraints,
  locked: ReadonlySet<number>,
): Counts | null {
  if (totalServings(counts) < constraints.maxItems) return counts;

  let best: Counts | null = null;
  let bestScore = Infinity;
  for (const index of [...counts.keys()].sort((a, b) => a - b)) {
    if (locked.has(index) && (counts.get(index) ?? 0) <= 1) continue;
    const next = removeServing(counts, index);
    const nextScore = score(next, candidates, targets);
    if (nextScore < bestScore) {
      bestScore = nextScore;
      best = next;
    }
  }
  return best;
}

function toPlate(
  counts: Counts,
  candidates: Candidate[],
  targets: MacroTargets,
  shortfall: PlateShortfall | null,
): SuggestedPlate {
  const selections = [...counts.entries()]
    .filter(([, servings]) => servings >= MIN_SERVINGS)
    .sort((a, b) => a[0] - b[0])
    .map(([index, servings]) => ({ item: candidates[index].item, servings }));
  const totals = totalsFor(counts, candidates);
  return {
    selections,
    totals,
    deviation: deviation(totals, targets),
    shortfall,
  };
}

/**
 * Suggest a plate of menu items approximately hitting `targets`.
 *
 * Pure: no I/O, no clock, no randomness, no React. The same input always
 * returns the same output. Items whose macros are incomplete are excluded —
 * an item with unknown protein is not a zero-protein item, and including it
 * would let the optimizer "hit" a target with food it cannot account for.
 *
 * Never throws. An impossible request comes back as a well-formed plate with
 * `shortfall` set, because an empty menu is a normal Tuesday, not a bug.
 */
export function suggestPlate(
  items: readonly MenuItem[],
  targets: MacroTargets,
  constraints: PlateConstraints = DEFAULT_CONSTRAINTS,
): SuggestedPlate {
  const candidates = items
    .map(toCandidate)
    .filter((c): c is Candidate => c !== null)
    // Re-index against the filtered array so counts key into `candidates`,
    // while the original order — and so tie-breaking — is preserved.
    .map((c, index) => ({ ...c, index }));

  const empty: SuggestedPlate = {
    selections: [],
    totals: { ...ZERO_TOTALS },
    deviation: deviation(ZERO_TOTALS, targets),
    shortfall: "no-complete-items",
  };
  if (candidates.length === 0) return empty;

  const seeded = greedySeed(candidates, targets, constraints);
  const searched = localSearch(seeded, candidates, targets, constraints);

  if (categoriesIn(searched, candidates).size >= constraints.minCategories) {
    return toPlate(searched, candidates, targets, null);
  }

  // An empty plate means every dish on offer moves us further from the target
  // — targets smaller than the smallest serving, typically. Repairing it up to
  // the category floor would force in food nobody asked for and score worse
  // than suggesting nothing, so report it instead.
  if (searched.size === 0) {
    return toPlate(searched, candidates, targets, "targets-unreachable");
  }

  const repaired = repairCategories(searched, candidates, targets, constraints);
  // A menu with a single station cannot meet a two-station floor. Return the
  // best plate we found and say so, rather than returning nothing useful.
  if (repaired === null) {
    return toPlate(searched, candidates, targets, "targets-unreachable");
  }
  return toPlate(repaired, candidates, targets, null);
}
