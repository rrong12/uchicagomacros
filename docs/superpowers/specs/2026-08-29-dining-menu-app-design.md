# UChicago Dining Menu App — Design

**Date:** 2026-08-29
**Owner:** Zhikang (Robert) Rong
**Status:** M1 (menu viewer) and M2 (plate builder) shipped. Parts of §2 were
corrected on 2026-09-17 — corrections are marked inline rather than silently
rewritten, so the record of what was believed when stays readable.

---

## 1. What this is

A mobile-first single-page web app showing today's menus across UChicago's four
dining commons, with filtering and sorting by calories, protein, fat, and carbs —
plus a **plate builder** that assembles a set of menu items hitting the user's
macro targets.

It does two things the official Dine On Campus portal cannot:

1. **Compare all four halls at once.** The official portal shows one location at a
   time. Deciding *where* to eat is the actual daily question.
2. **Build a plate to a macro target.** Constrained selection over the day's
   items, not a nutrition table you read manually.

**Menu history is out of scope.** It was in an earlier draft as a "moat," but it
requires a scheduled server-side ingest job, and server-side access is blocked
(§2.4). Dropping it removes the entire backend.

---

## 2. Verified facts

Every claim below was confirmed by direct observation on 2026-08-29. This section
exists because the previous version of this project was specified on unverified
assumptions and died in profiling.

Three claims in §2.5 and §5.4 turned out to be wrong anyway, caught on
2026-09-17 by re-reading the captured fixture rather than the notes taken from
it. They are struck through and corrected in place. The lesson is not that
observation failed — the fixture was right all along — but that a field absent
from the notes is not a field absent from the payload.

### 2.1 The data source

UChicago does not host menus. It points to a Dine On Campus portal at
`dineoncampus.com/uchicago`, a Vue SPA backed by a JSON API. We call the JSON API
directly and never parse HTML.

**There are two APIs.** The live site uses `apiv4.dineoncampus.com`. An older
`api.dineoncampus.com/v1` still serves current data. This distinction is
load-bearing — see §2.4.

### 2.2 Access matrix (the finding that determines the architecture)

| Host | Server-side (curl) | Browser, cross-origin |
|---|---|---|
| `api.dineoncampus.com/v1` | ❌ 403 Cloudflare | ✅ **200 + full JSON** |
| `apiv4.dineoncampus.com` | ❌ 403 Cloudflare | ❌ 200, but no `Access-Control-Allow-Origin` |

Exactly one path is viable: **the v1 API, called from the user's browser.**

Confirmed by running `fetch()` from the console on `https://example.com` against
all four location IDs. v1 returned `status: "success"` for every hall. v4 returned
`net::ERR_FAILED 200 (OK)` — the request succeeded and Cloudflare allowed it, but
the browser discarded the response for lack of a CORS header.

**Two consequences that constrain everything:**

1. **No server may fetch this API.** Datacenter IPs are Cloudflare-blocked on both
   hosts. Any SSR, edge function, cron job, or backend proxy will fail in
   production even when it works locally.
2. **v1 sends permissive CORS headers**, so a browser on any origin can read the
   response. The app is viable with no backend at all.

### 2.3 Endpoints (v1)

```
GET https://api.dineoncampus.com/v1/location/{LOCATION}/periods?platform=0&date=YYYY-MM-DD
GET https://api.dineoncampus.com/v1/location/{LOCATION}/periods/{PERIOD}?platform=0&date=YYYY-MM-DD
```

The first returns the day's meal periods for a hall; the second returns the items
within one period. `all_locations` is not needed — location IDs are hardcoded
(§5.1).

### 2.4 The four locations

All four confirmed working against v1 on 2026-08-29. Names are not returned by
the API (§2.5) and were mapped by observation in the browser.

| Hall | Location ID | Status 2026-08-29 |
|---|---|---|
| Baker | `618a6caab63f1e2d4442bdf5` | open — Breakfast \| Lunch \| Dinner |
| Woodlawn | `618a6df9b63f1e2d692b1f5c` | `closed: true` |
| Bartlett | `618a6f95b63f1e2d3b454065` | `closed: true` |
| Cathey | `618a6efbb63f1e2d444389c1` | `closed: true` |

Note the IDs were read from **v4** URLs but verified to work against **v1** — the
two APIs share location identifiers.

### 2.5 Payload shape (v1 — snake_case)

> ⚠️ **v1 and v4 use different field naming.** v4 returns `valueNumeric`,
> `mrnFull`, `sortOrder`, `customAllergens`. **v1 snake-cases the same fields:
> `value_numeric`, `mrn_full`, `sort_order`, `custom_allergens`.** We build
> against v1. Any example found online or in the D.I.S.H docs must be checked
> for which shape it is.
>
> **Corrected 2026-09-17** (from `tests/fixtures/baker-open.json`, the response
> captured on 2026-08-29 — so this was wrong when written, not a change
> upstream). This block previously claimed v1 returns *no* `customAllergens`
> and *no* `calories`. Both claims are false: v1 items carry `custom_allergens`
> (present on all 20 fixture items, though empty on every one) and a
> convenience `calories` field. The naming difference is real; the missing
> fields were not.

Top-level keys: `status`, `request_time`, `records`, `allergen_filter`, `menu`,
`periods`, `closed`.

- `periods` (top level) — the **list** of available meal periods for the day.
- `menu.periods` — a **single object**, the full detail of one period, already
  containing `categories[].items[]`. The first request therefore returns complete
  item data for the default period; a second call is only needed for *other*
  periods (§5.2).

An item:

```jsonc
{
  "id": "6a9349a7190d6bcc98a24e43",
  "name": "Blueberry Muffin",
  "desc": "Bakery fresh blueberry muffin",
  "portion": "2 oz portion",
  "ingredients": "Muffin Mix^, Water, Blueberries, All Purpose Flour^",
  "calories": 180,
  "nutrients": [
    { "id": "", "name": "Protein (g)", "value": "2", "uom": "g", "value_numeric": "2" },
    { "id": "", "name": "Dietary Fiber (g)", "value": "less than 1 gram",
      "uom": "g", "value_numeric": "1" }
    // Calories, Total Carbohydrates (g), Sugar (g), Total Fat (g),
    // Cholesterol (mg), Sodium (mg), Potassium (mg), Calcium (mg), Iron (mg), ...
  ],
  // Typed dietary and allergen tags. See §2.7.
  "filters": [
    { "id": "", "name": "Vegetarian", "type": "label",    "custom": null },
    { "id": "", "name": "Egg*",       "type": "allergen", "custom": null },
    { "id": "", "name": "Gluten",     "type": "allergen", "custom": null }
  ],
  "custom_allergens": []
}
```

**Macros are present per item, with portion sizes.** Confirmed, not assumed.

**Three v1-specific parsing hazards:**

1. ~~**No `calories` field.**~~ **Corrected 2026-09-17:** items *do* carry a
   top-level `calories` number, and on all 20 fixture items it equals the
   `"Calories"` nutrient exactly. `normalize.ts` reads the nutrient and is
   therefore correct either way; no code change is needed. Prefer the nutrient
   regardless, so one code path handles every macro.
2. **`value` may be prose, not a number** — `"less than 1 gram"` was observed.
   Only `value_numeric` is safely parseable, and it rounds (that item reports
   `"1"`).
3. **`nutrients[].id` is `""`**, so it cannot be used as a key (§5.4).

**The API does not return hall names.** `menu.name` is `null` and no `location`
object exists. Hall names must be hardcoded alongside the IDs (§2.4).

**Two observed behaviours the UI must handle:**

- **`closed: true` is common, not exceptional.** Three of four halls were closed
  on 2026-08-29. Treat it as a normal render state from day one.
- **Period count varies by date and hall** — three periods on 2026-08-29, six on
  2026-01-14. Nothing may assume a fixed set of meal periods.

### 2.6 Prior art

Northwestern's `f00d` (WildHacks 2022) and Michigan Tech's D.I.S.H (last updated
March 2025) both consume this API; D.I.S.H's `API_documentation.md` is where the
v1 endpoint shapes came from. Neither targets UChicago, and neither does
macro-target plate building. Their existence saved us the endpoint archaeology.

### 2.7 Allergen and dietary data (added 2026-09-17)

Every item carries a `filters[]` array of typed tags. Observed in the captured
Baker fixture — 20 items, all 20 tagged:

| `type` | Observed names |
|---|---|
| `label` | Vegetarian (18), Avoiding Gluten (10), Good Source of Protein (6), Vegan (5), How Good Friendly (3) |
| `allergen` | Gluten, Milk, Wheat, Soy, Egg, Onion, Garlic, Pork, Poultry, Sulphites, Strawberry, Orange, Celery\*, Mustard\*, MSG\*, Beef\*, Milk\*, Egg\*, Gluten\* |

Three consequences:

1. **Allergen filtering needs no new request and no ingredient parsing.** The
   data is already in every response we fetch. This makes most of the §9
   `allergen_filter` question moot.
2. **`filters[].id` is `""`**, exactly like `nutrients[].id`. Tags can only be
   matched by name string, with the same fragility (§5.4).
3. **`custom_allergens` is present but empty** on all 20 items. Treat it as
   unpopulated-for-now, not absent.

**The `*` suffix is undecoded and safety-critical.** Some allergen names end in
`*` and some do not, and both forms occur — "Hard Boiled Egg" is tagged `Egg`,
while "Blueberry Muffin" is tagged `Egg*` with no egg in its visible ingredient
list. The plausible reading is *unstarred = declared ingredient, starred =
trace or inherited from an unexpanded `^` sub-recipe*.

Measured over the fixture, starred allergens never appear as a word in the
ingredient text (0/11) and always sit on an item containing a `^` sub-recipe
(11/11); unstarred appear 26.5% of the time and carry a caret 89.8% of the
time. Directionally consistent, **not conclusive** — the caret rate barely
discriminates, and one hall on one day is a thin sample.

`scripts/probe-allergens.js` tests this at scale against live data.

**Until `*` is confirmed, do not ship a filter that asserts a dish is safe.**
If the reading is wrong, the failure mode is an allergic reaction. Either treat
starred and unstarred identically (always warn), or get confirmation from Dine
On Campus (§9). Surface allergens; never certify their absence.

---

## 3. Constraints and accepted risks

- **No backend for menu data.** A requirement, not a simplification (§2.2).
- **Dependence on a legacy API — accepted risk.** The live site has moved to v4;
  we must use v1 because v4 blocks CORS. If Dine On Campus retires v1, the app
  breaks with no fallback, because every other route is Cloudflare-blocked. The
  mitigation is to request sanctioned access from UChicago Dining (§9), not a
  technical workaround.
- **No University trademark in the product name.** Working directory is
  `dining-app`; the public name is open (§9).
- **Mobile-first.** Primary use is a student on a phone deciding where to eat.
- **Polite request volume.** Never re-fetch a menu already held for the same
  (location, date, period).
- **Timezone is `America/Chicago`.** "Today" is computed in campus local time,
  never the device's timezone.

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
              api.dineoncampus.com/v1
```

**Why no SSR.** Next.js server components, `getServerSideProps`, or any Vercel
edge function would issue requests from a datacenter IP and receive a Cloudflare
403. The app works *because* requests originate from the student's browser. This
is the most important constraint in the document and must not be refactored away.

### 4.1 Module boundaries

| Module | Responsibility | Depends on |
|---|---|---|
| `api/client.ts` | Raw HTTP to v1. Knows URLs, nothing about food. | — |
| `api/cache.ts` | localStorage keyed by `(locationId, date, periodId)`. | — |
| `domain/normalize.ts` | Raw JSON → internal `MenuItem`. Owns nutrient parsing. | — |
| `domain/types.ts` | `MenuItem`, `Period`, `Hall`, `MacroTargets`. | — |
| `domain/filter.ts` | Pure filtering and sorting over `MenuItem[]`. | types |
| `domain/plate.ts` | The optimizer. Pure function, no I/O, no React. | types |
| `state/menuStore.ts` | Fetch orchestration, loading / error / closed state. | api, domain |
| `ui/*` | Presentation only. No fetching, no parsing. | state, domain |

The rule: `domain/` is pure and independently testable against fixture JSON.
Nothing in it imports React or touches the network. The plate builder in
particular must be unit-testable without a browser.

---

## 5. Data flow

### 5.1 Location IDs are constants

The halls do not change. Hardcode the four IDs from §2.4. This eliminates an
`all_locations` call, one failure mode, and any need to discover `site_id`.

### 5.2 Request strategy

Rendering every hall × every period would be ~20 requests. Instead:

1. On load, compute the date and current meal period in `America/Chicago`.
2. Fetch `periods` for all four halls **in parallel** (4 requests).
3. Skip any hall returning `closed: true` — no further requests for it.
4. Fetch the **current period's** detail for each open hall in parallel.
5. Other periods load on demand when the user switches.

First load: ~8 requests, fewer when halls are closed. Repeat visits same day: zero.

### 5.3 Caching

`localStorage`, keyed `menu:{locationId}:{date}:{periodId}`, storing the
normalized payload plus `fetchedAt`. Menus for a past date are immutable, so
entries stay valid until the date rolls over. Evict stale-dated keys on startup.

Cache `closed: true` results too — a closed hall stays closed all day, and
re-requesting it on every page load is wasteful.

### 5.4 Nutrient normalization — the fragile layer

`nutrients[].id` is `""` for every entry, so **nutrients can only be matched by
name string** (`"Protein (g)"`, `"Total Fat (g)"`). All values are strings.

`normalize.ts` therefore:

- maps known name strings to canonical fields (`protein_g`, `fat_g`, `carbs_g`,
  `calories`, `sodium_mg`, `fiber_g`, …) — including `"Calories"`, which in v1
  exists *only* here and has no top-level field
- reads **`value_numeric`**, never `value` — `value` may contain prose such as
  `"less than 1 gram"`. Parse with `Number()`, treating `""`, `null`, and `NaN` as
  **missing** rather than zero. An item with unknown protein is not a
  zero-protein item, and the optimizer must not treat it as one
- **logs unrecognized nutrient names** rather than silently discarding them, so
  upstream renames surface instead of quietly degrading results
- exposes `MenuItem.macrosComplete: boolean` so the UI can flag incomplete items
  and the optimizer can exclude them

~~The `^` suffix in `ingredients` (`"Liquid Egg^"`) is an allergen marker.~~
**Corrected 2026-09-17:** `^` marks a **sub-recipe** — a compound ingredient
whose own ingredients are not expanded inline. It is not an allergen marker.
The fixture carries `Light Brown Sugar^` and `All Purpose Flour^`, neither an
allergen, alongside `Liquid Egg^`. Allergens are tagged separately and
explicitly in `filters[]` (§2.7), so no ingredient-string parsing is needed.

---

## 6. Plate builder

Given one hall's items for a period and target macros, select items and serving
counts approximately hitting the target.

A **multi-dimensional bounded knapsack**:

- **Variables:** integer count `x_i ∈ [0, max_i]` per item
- **Objective:** minimise weighted absolute deviation from targets across
  protein / fat / carbs / calories
- **Constraints** (the rules that keep results edible):
  - total items ≤ N (default 6)
  - at most `max_i` servings of any single item (default 2)
  - at most one item from entrée-type categories
  - at least one item from ≥ 2 distinct categories
  - exclude items where `macrosComplete === false`

**Implementation:** greedy seed plus local search (swap / add / remove
neighbourhood). A few hundred lines, milliseconds on a day's items, easy to test.
Escalate to an ILP formulation via a JS solver only if results are poor — and only
with a before/after comparison, not on instinct.

`plate.ts` is pure: `(items, targets, constraints) => Plate`.

---

## 7. Testing

- **Fixture-driven.** Save real API responses to `tests/fixtures/` and test
  `normalize.ts` against them — including missing nutrients, `null` values,
  unknown nutrient names, `closed: true` halls, and empty period lists.
- **Property tests for the optimizer.** Every returned plate satisfies every
  declared constraint; no plate contains an item absent from the input.
- **No `fetch` mocking in domain tests** — `domain/` never fetches.

---

## 8. Milestones

**M1 — Menu viewer (target: one week).** Four halls, current period, closed-hall
handling, filter and sort by calories/protein/fat/carbs, mobile layout, deployed
and publicly reachable. This alone beats the official portal for "where should I
eat" and is the version that gets real users.

**M2 — Plate builder.** Optimizer, macro-target UI, constraint controls.
Immediately follows M1; not deferred indefinitely.

**M3 — Polish informed by real usage.** Period switching, allergen and dietary
filters, saved targets, share-a-plate links. Scoped by what users ask for.

---

## 9. Open questions

- **Product name.** Working name is **UChicagoMacros**. Note this contains a
  University trademark, which the original constraints ruled out. Acceptable for
  a repo name; revisit before any custom domain, campus-wide promotion, or app
  store listing.
- **Sanctioned access.** Email UChicago Dining about official API access. This is
  the only real mitigation for the v1-retirement risk, and an approved feed would
  also let history back into scope.
- **Terms of service.** Read Dine On Campus's ToS before public launch.
- ~~**`allergen_filter`** appears as a top-level response field, implying a
  server-side allergen filter parameter. Probing it may remove M3 work.~~
  **Largely answered 2026-09-17.** It is a plain boolean, `false` in the
  fixture. Whatever it toggles, we do not need it: per-item allergen and
  dietary tags already ship in every response (§2.7), so filtering is a
  client-side concern. `scripts/probe-allergens.js` still tries three
  candidate request params, but this is no longer blocking.
- **What does `*` mean on an allergen name?** Open, and the only
  safety-critical unknown in this document. See §2.7. Ask Dine On Campus
  alongside the sanctioned-access request above; do not ship a
  safety-asserting filter on the inferred reading.
- **Historical dates.** `date=2026-01-14` returned data on 2026-08-29. If arbitrary
  past dates are queryable, the original "rolling window" premise was wrong.
  Doesn't affect this build.
- **`records: 0`** appeared alongside six populated periods. Meaning unknown.

---

## 10. Non-goals

Do not add without being asked.

- Menu history / archival ingest (requires a blocked backend)
- Any server, database, or scheduled job
- User accounts or authentication
- Server-side rendering of any kind (breaks under Cloudflare — §4)
- Native mobile apps
- Calorie tracking, food logging, or diary features
- Scraping HTML as a fallback
- Engineering around Cloudflare's bot protection
