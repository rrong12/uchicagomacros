# UChicagoMacros

Today's menus for UChicago's four dining commons — Baker, Cathey, Woodlawn, and
Bartlett — in one view, sortable by calories, protein, fat, and carbs.

**Live: https://rrong12.github.io/uchicagomacros/**

The official Dine On Campus portal shows one hall at a time and buries nutrition
behind a click. The daily question is *where should I eat*, which needs all four
halls side by side.

---

## Why there's no backend

The app runs entirely in the browser. That isn't a shortcut — it's forced by how
the upstream API behaves, and it was measured before any code was written:

| Client | Result |
|---|---|
| `curl` / any server-side fetch | **403** Cloudflare challenge |
| Browser, cross-origin `fetch()` | **200 + full JSON** |

Requests originate from the student's own browser, so they pass. Any server-side
call — SSR, an edge function, a cron job — gets blocked. This is why there is no
API route, no database, and no scheduled ingest, and why introducing server-side
rendering would break production while working fine locally.

There's a second wrinkle. The live portal has moved to `apiv4`, which sends no
`Access-Control-Allow-Origin` header and so can't be read cross-origin. The
legacy `v1` host still serves current data *and* permits CORS, so that's what
this uses — a deliberate, documented dependency on a legacy endpoint.

## The interesting part: the data is dirty

Nutrition data arrives in a shape that punishes naive parsing.

**Nutrients have no IDs.** Every `nutrients[].id` is `""`, so they can only be
matched by display-name string. Unrecognized names are logged rather than
silently dropped, with an explicit allowlist of names we deliberately skip — so
the warning still means something when the upstream schema changes.

**Numeric fields aren't reliably numeric.** Of 300 nutrient entries in a single
day's menu, 26 hold values like `"0+"`, `"3+"`, or `"-"`. The human-readable
`value` field is worse — `"less than 1 gram"` is a real observed value.

**Missing is not zero.** An item whose protein the API didn't report is not a
zero-protein item. Every macro is `number | null`, unknowns render as `—` rather
than `0`, they sort last in *both* directions, and they're excluded from a filter
on that field rather than silently passing it. This invariant is asserted at the
parsing layer, the sorting layer, and the render layer, because getting it wrong
would quietly produce wrong answers rather than visible errors.

**Halls close.** Three of four are shut outside term. Closed is a normal render
state, distinct from an open hall with an empty menu.

## Architecture

```
src/domain/     pure logic — no React, no network, fully unit-tested
  types.ts      MenuItem, HallDay, Macro = number | null
  halls.ts      the four location IDs
  datetime.ts   today in America/Chicago, never the device's timezone
  nutrients.ts  name → field mapping, value parsing
  normalize.ts  raw API JSON → HallDay
  filter.ts     sorting and filtering
src/api/        client.ts (browser-only, documented) + cache.ts (localStorage)
src/state/      useMenus — parallel fetch across four halls, cache-first
src/ui/         presentation only
```

Nothing in `domain/` imports React or calls `fetch`, which is what makes it
testable against captured fixtures rather than mocks.

## Tests

44 tests. The domain tests run against **real captured API responses**
(`tests/fixtures/`), not hand-written mocks, so they exercise the actual mess
described above — including a genuinely closed hall whose response body is four
keys with no `menu` object at all.

```bash
npm install
npm test          # 44 tests
npm run dev       # http://localhost:5173
npm run build
```

CI typechecks, tests, and builds before publishing, so a failing test blocks the
deploy.

## Not built

Menu history (needs the blocked server-side ingest), user accounts, and calorie
logging. Next up is a plate builder: given macro targets, select a set of items
that hits them, subject to constraints that keep the result edible — a bounded
multi-dimensional knapsack over the day's menu.

## Data

Menu data belongs to Dine On Campus and the University of Chicago. This is an
unaffiliated student project.
