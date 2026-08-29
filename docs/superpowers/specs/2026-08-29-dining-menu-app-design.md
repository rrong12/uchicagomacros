# UChicago Dining Menu App — Design

**Date:** 2026-08-29
**Owner:** Zhikang (Robert) Rong
**Status:** Design approved pending review. No implementation started.

---

## 1. What this is

A mobile-first single-page web app showing today's menus across UChicago's four
dining commons (Baker, Cathey, Woodlawn, Bartlett), with filtering and sorting by
calories, protein, fat, and carbs — plus a **plate builder** that assembles a set
of menu items hitting the user's macro targets.

It does two things the official Dine On Campus portal cannot:

1. **Compare across all four halls at once.** The official portal shows one
   location at a time. Deciding *where* to eat is the actual daily question.
2. **Build a plate to a macro target.** Constrained selection over the day's
   items, not just a nutrition table you read manually.

**Menu history is explicitly out of scope.** It was in an earlier draft as a
"moat," but it requires a scheduled server-side ingest job, and server-side
access is blocked (see §3). Dropping it removes the entire backend.

---

## 2. Verified facts

Everything below was confirmed by direct observation on 2026-08-29, not assumed.
This section exists because the previous version of this project was specified on
unverified assumptions.

### 2.1 The data source

UChicago does not host menus itself. It points to a Dine On Campus portal at
`dineoncampus.com/uchicago`, a Vue SPA backed by a JSON API at
`api.dineoncampus.com`. We call the JSON API. We do not parse HTML.

### 2.2 Endpoints

```
GET /v1/locations/all_locations?platform=0&site_id={SITE}&for_menus=true&with_buildings=true
GET /v1/location/{LOCATION}/periods?platform=0&date=YYYY-MM-DD
GET /v1/location/{LOCATION}/periods/{PERIOD}?platform=0&date=YYYY-MM-DD
```

Known UChicago location ID: `618a6f95b63f1e2d3b454065`. The remaining three must
be collected the same way (DevTools → Network → read `locationId` off the
response) and hardcoded — see §5.1.

### 2.3 Payload shape (confirmed)

`periods` returns `{status, request_time, records, allergen_filter, closed, menu, periods[]}`.
A period detail response nests `period.categories[].items[]`, where each item is:

```jsonc
{
  "id": "6968936a83c04986a06cbbd6",
  "name": "Scrambled Eggs",
  "desc": "",
  "portion": "1/2 cup",
  "ingredients": "Liquid Egg^, Canola Oil",
  "calories": 210,
  "customAllergens": [],
  "nutrients": [
    { "id": null, "name": "Protein (g)", "value": "14", "uom": "g", "valueNumeric": "14" }
    // Calories, Total Carbohydrates (g), Sugar (g), Total Fat (g),
    // Saturated Fat (g), Cholesterol (mg), Dietary Fiber (g),
    // Sodium (mg), Potassium (mg), ...
  ]
}
```

**Macros are present per item, with portion sizes.** This is the fact the plate
builder depends on, and it is confirmed rather than assumed.

### 2.4 Access constraints (the load-bearing finding)

| Client | Result |
|---|---|
| `curl` (any User-Agent) | **403** Cloudflare challenge |
| Server-side fetchers | **403** Cloudflare challenge |
| Real browser, cross-origin `fetch()` from an unrelated origin | **200, full JSON** |

Verified by running a `fetch()` against
`/v1/location/618a6f95b63f1e2d3b454065/periods?platform=0&date=2026-01-14` from
the console on `example.com`, which returned `status: "success"` with six periods.

**Two consequences that constrain the entire architecture:**

1. **No server may fetch this API.** Datacenter IPs are Cloudflare-blocked. Any
   SSR, edge function, cron job, or backend proxy will fail in production even if
   it works in local development.
2. **The API sends permissive CORS headers**, so a browser on *any* origin can
   read the response. The app is therefore viable with no backend whatsoever.

### 2.5 Prior art

Northwestern's `f00d` (WildHacks 2022) and Michigan Tech's D.I.S.H (last updated
March 2025) both consume this API. D.I.S.H's `API_documentation.md` is the source
of the endpoint shapes above. Neither is a UChicago tool, and neither implements
macro-target plate building. Their existence is useful — the endpoint archaeology
is already done — not disqualifying.

---

## 3. Constraints

- **No backend for menu data.** Non-negotiable, per §2.4. Not a simplification —
  a requirement.
- **No University trademark in the product name.** Working directory is
  `dining-app`; the public name is an open question (§9).
- **Mobile-first.** The primary use is a student on a phone deciding where to eat.
  Desktop is secondary.
- **Polite request volume.** Cache aggressively; never re-fetch a menu already
  held for the same (location, date, period).
- **Timezone is `America/Chicago`.** "Today" must be computed in campus local
  time, never the device's timezone.

---

## 4. Architecture

Pure client-side SPA. React + TypeScript + Vite. Deployed as static assets on
Vercel (GitHub Pages is an equivalent fallback).

```
┌──────────────────────────────────────────────────┐
│  Browser (student's device)                      │
│                                                  │
│  ┌────────────┐   ┌──────────────┐               │
│  │ UI layer   │──▶│ selectors    │               │
│  │ React      │   │ filter/sort  │               │
│  └────────────┘   └──────┬───────┘               │
│         │                │                       │
│         ▼                ▼                       │
│  ┌────────────┐   ┌──────────────┐               │
│  │ plate      │   │ menu store   │               │
│  │ builder    │◀──│ normalized   │               │
│  └────────────┘   └──────┬───────┘               │
│                          │                       │
│                   ┌──────▼───────┐               │
│                   │ api client   │──▶ localStorage cache
│                   └──────┬───────┘               │
└──────────────────────────┼───────────────────────┘
                           │  fetch() — user's own IP
                           ▼
              api.dineoncampus.com
```

**Why no SSR.** Next.js server components, `getServerSideProps`, or any Vercel
edge function would issue the request from a datacenter IP and receive a
Cloudflare 403. The app functions *because* requests originate from the student's
browser. This is the single most important architectural constraint and it must
not be refactored away.

### 4.1 Module boundaries

| Module | Responsibility | Depends on |
|---|---|---|
| `api/client.ts` | Raw HTTP to Dine On Campus. Knows URLs, nothing about food. | — |
| `api/cache.ts` | localStorage read/write keyed by `(locationId, date, periodId)`. | — |
| `domain/normalize.ts` | Raw API JSON → internal `MenuItem`. Owns nutrient parsing. | — |
| `domain/types.ts` | `MenuItem`, `Period`, `Hall`, `MacroTargets`. | — |
| `domain/filter.ts` | Pure filtering and sorting over `MenuItem[]`. | types |
| `domain/plate.ts` | The optimizer. Pure function, no I/O, no React. | types |
| `state/menuStore.ts` | Fetch orchestration, loading/error state. | api, domain |
| `ui/*` | Presentation only. No fetching, no parsing. | state, domain |

The rule: `domain/` is pure and independently testable with fixture JSON. Nothing
in `domain/` imports React or touches the network. The plate builder in
particular must be unit-testable without a browser.

---

## 5. Data flow

### 5.1 Location IDs are constants, not runtime lookups

The four halls do not change. Hardcode them:

```ts
export const HALLS = [
  { id: "618a6f95b63f1e2d3b454065", name: "..." },  // confirmed
  // three more, collected via DevTools → Network → locationId
] as const;
```

This removes an `all_locations` call, one failure mode, and the need to discover
`site_id` at all.

### 5.2 Request strategy

Naively rendering all four halls × all six periods is 20+ requests. Instead:

1. On load, compute the current date and meal period in `America/Chicago`.
2. Fetch `periods` for all four halls **in parallel** (4 requests).
3. Fetch the **current period's** detail for each hall in parallel (4 requests).
4. Other periods load on demand when the user switches.

Steady state on first load: ~8 requests. Repeat visits the same day: zero.

### 5.3 Caching

`localStorage`, keyed `menu:{locationId}:{date}:{periodId}`, storing the
normalized payload plus a `fetchedAt` timestamp. Menus for a given date are
immutable in practice, so entries are valid until the date rolls over. Evict keys
whose date is in the past on startup.

### 5.4 Nutrient normalization — the fragile part

`nutrients[].id` is `null` for every entry, so **nutrients can only be matched by
name string** (`"Protein (g)"`, `"Total Fat (g)"`). Values are strings, including
`valueNumeric`.

`normalize.ts` therefore:

- maps a known set of name strings to canonical fields
  (`protein_g`, `fat_g`, `carbs_g`, `calories`, `sodium_mg`, `fiber_g`, …)
- parses `valueNumeric` with `Number()`, treating `null`, `""`, and `NaN` as
  **missing** rather than zero — an item with unknown protein is not a
  zero-protein item, and the plate builder must not treat it as one
- **logs any unrecognized nutrient name** rather than silently discarding it, so
  upstream renames surface instead of quietly degrading the app
- exposes `MenuItem.macrosComplete: boolean` so the UI can mark incomplete items
  and the optimizer can exclude them

The `^` suffix in `ingredients` (e.g. `"Liquid Egg^"`) is an allergen marker; the
convention needs decoding before allergen filtering is built (§9).

---

## 6. Plate builder

Given the day's items at one hall and target macros, select a set of items and
serving counts approximately hitting the target.

This is a **multi-dimensional bounded knapsack**. Formulation:

- **Variables:** integer count `x_i ∈ [0, max_i]` per item
- **Objective:** minimise weighted absolute deviation from targets across
  protein / fat / carbs / calories
- **Constraints** (the "keeps it edible" rules):
  - total items ≤ N (default 6)
  - at most `max_i` servings of any single item (default 2)
  - at most one item from the `Entrée`-type categories
  - at least one item from ≥ 2 distinct categories
  - exclude items where `macrosComplete === false`

**Implementation:** start with a greedy seed plus local search (swap / add /
remove neighbourhood), which is a few hundred lines, runs in milliseconds on a
day's worth of items, and is easy to test. If results are poor, escalate to an
ILP formulation via a JS solver — but only with a before/after comparison, not on
instinct.

`plate.ts` is a pure function: `(items, targets, constraints) => Plate`. No React,
no network, fully unit-testable against fixture data.

---

## 7. Testing

- **Fixture-driven.** Save real API responses to `tests/fixtures/` and test
  `normalize.ts` against them, including malformed cases: missing nutrients,
  `null` values, unknown nutrient names, closed halls, empty periods.
- **Property tests for the optimizer.** Every returned plate satisfies every
  declared constraint; no plate contains an item absent from the input.
- **No mocking of `fetch` in domain tests** — `domain/` never fetches.

---

## 8. Milestones

**M1 — Menu viewer (target: one week).** Four halls, current period, filter and
sort by calories/protein/fat/carbs, mobile layout, deployed and publicly
reachable. This alone beats the official portal for the "where should I eat"
question and is the version that gets real users.

**M2 — Plate builder.** The optimizer, macro-target UI, constraint controls.
Immediately follows M1; not deferred indefinitely.

**M3 — Polish informed by real usage.** Period switching, allergen and dietary
filters, saved macro targets, share-a-plate links. Scoped by what users actually
ask for, not guessed in advance.

---

## 9. Open questions

- **Product name.** Must avoid University trademarks. Unresolved.
- **The other three location IDs.** Collected via DevTools; trivial but not done.
- **Historical dates.** A `date=2026-01-14` request returned data on 2026-08-29 —
  roughly seven months in the past. If arbitrary past dates are queryable, the
  original "rolling window" premise was wrong. Does not affect this build, but
  worth confirming.
- **`records: 0`** appeared in a response that nonetheless contained six periods.
  Meaning unknown; ignore unless it turns out to matter.
- **`allergen_filter`** is a top-level response field, suggesting a server-side
  allergen filter parameter exists. Probing it may remove work in M3.
- **Terms of service.** Read Dine On Campus's ToS before public launch. The app
  makes the same requests a student's browser already makes, but check.

---

## 10. Non-goals

Explicitly out of scope. Do not add without being asked.

- Menu history / archival ingest (requires a blocked backend)
- Any server, database, or scheduled job
- User accounts or authentication
- Server-side rendering of any kind (breaks under Cloudflare — see §4)
- Native mobile apps
- Calorie tracking, food logging, or diary features
- Scraping HTML as a fallback
- Engineering around Cloudflare's bot protection
