# UChicagoMacros

Today's menus for Baker, Cathey, Woodlawn, and Bartlett, with calories, protein,
carbs, and fat visible on every food card.

**[Open UChicagoMacros](https://rrong12.github.io/uchicagomacros/)**

## Browsing the menu

- Select a dining hall and Breakfast, Lunch, or Dinner. The meal selection stays
  the same when switching halls, including when that meal is unavailable there.
- Search by dish or station name. Clear the search to see the whole menu again.
- Browse food cards grouped by station; expand Ingredients for the upstream list.
- Nutrition is per listed portion. An em dash means a value was not reported,
  rather than zero. No macro display or protein-sort toggle is required.
- Closed halls, missing meal data, loading, and network failures have distinct states.

The responsive design uses a maroon header, warm white cards, and an original
architectural line illustration. Desktop menus use three columns; phones use one.
The initial meal choice is a Chicago-clock heuristic, not verified serving hours.
“Menus available” does not mean a dining hall is currently open.

## Data access

React + TypeScript + Vite, deployed as a static app through GitHub Pages.
Menu requests run in the visitor's browser using the Dine On Campus v1 API.

During development, direct curl requests received Cloudflare 403 responses while
cross-origin browser requests to v1 succeeded. The portal's apiv4 host did not
allow our cross-origin browser test. These are observed access conditions, not
vendor guarantees: this app depends on an undocumented upstream interface.

The API's initial response includes only one meal's detail. The app loads other
listed periods separately and caches responses in localStorage for the day.
Upstream data or access rules may change. Google Fonts supplies the display fonts,
with system font fallbacks when unavailable.

## Architecture

```text
src/domain/  menu types, hall IDs, Chicago dates, nutrient normalization, sorting/filter utilities
src/api/     browser fetch client and localStorage cache
src/state/   useMenus: load the four halls and each available meal
src/ui/      meal controls, station groups, nutrition cards, icons
src/App.tsx  hall selection, global meal selection, search, page composition
```

Nutrient IDs are empty, so normalization maps display names to known fields.
`value_numeric` can itself contain non-numeric data such as `0+` or `-`.
Missing values remain `null` throughout parsing and rendering.

## Develop and verify

```bash
npm ci
npm run dev      # http://localhost:5173/uchicagomacros/
npm test
npm run lint
npm run build
```

53 tests cover normalization against captured API responses, date handling,
cache behavior, macro utilities, rendering, hall/meal switching, search, and
closed/unavailable/loading/error states. Navigation tests use controlled menu
state; fixture tests retain the original captured responses in `tests/fixtures/`.
GitHub Actions typechecks, tests, and builds before publishing pushes to main.

## Next

The manual plate builder is available: add dishes, change servings in half-serving
steps (0.5–20), remove items, and see estimated macro totals. Missing nutrients
produce an “Incomplete” total. Plates are stored locally per hall, meal, and date;
saved nutrition reflects when items were added. The provider’s serving labels
are preserved, without guessing gram weights for cups or pieces.

Automatic plate suggestions against macro targets are next. Accounts, calorie
logging, and menu history are not part of the current app.

## Attribution

Independent student project by Robert Rong. Not affiliated with the University
of Chicago. Menu and nutrition information is provided by Dine On Campus.
The interface takes layout inspiration from [Eat UNC](https://eatunc.com/);
its code, branding, and artwork are not reused.
