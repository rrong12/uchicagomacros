/*
 * Allergen / dietary-filter probe for the Dine On Campus v1 API.
 *
 * WHY THIS EXISTS
 * The captured fixture shows v1 items already carry a `filters[]` array with
 * typed allergen and label entries. Some allergen names end in `*` and some do
 * not, and the difference is not documented anywhere we have found. A plausible
 * reading — inferred from 20 items on one day at one hall — is:
 *
 *     unstarred = allergen is a directly declared ingredient
 *     starred   = trace / "may contain" / inherited from an unexpanded
 *                 sub-recipe (the `^` marker in `ingredients`)
 *
 * That reading is a GUESS. This probe exists to test it against much more data
 * before anything safety-critical is built on it.
 *
 * HOW TO RUN
 * Server-side requests get Cloudflare 403s, so this has to run in a browser.
 * Open https://rrong12.github.io/uchicagomacros/ (any origin works — v1 sends
 * permissive CORS), open DevTools -> Console, paste this whole file, press
 * Enter. It prints a summary and leaves the full result on `window.__probe`.
 *
 * It makes roughly one request per hall plus one per period (~8-20 total),
 * serially with a short delay, to keep request volume polite.
 */
(async () => {
  const HALLS = {
    Baker: "618a6caab63f1e2d4442bdf5",
    Woodlawn: "618a6df9b63f1e2d692b1f5c",
    Bartlett: "618a6f95b63f1e2d3b454065",
    Cathey: "618a6efbb63f1e2d444389c1",
  };
  const BASE = "https://api.dineoncampus.com/v1/location";
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function get(url) {
    await sleep(250); // polite
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  const itemsOf = (payload) =>
    (payload?.menu?.periods?.categories ?? []).flatMap((c) => c.items ?? []);

  // ---- collect ------------------------------------------------------------
  const all = [];
  const meta = [];
  for (const [hall, id] of Object.entries(HALLS)) {
    try {
      const day = await get(`${BASE}/${id}/periods?platform=0&date=${date}`);
      meta.push({
        hall,
        closed: !!day.closed,
        allergen_filter: day.allergen_filter,
        records: day.records,
        periods: (day.periods ?? []).map((p) => p.name),
      });
      if (day.closed) continue;

      for (const it of itemsOf(day)) all.push({ hall, item: it });

      const shown = day?.menu?.periods?.id;
      for (const p of day.periods ?? []) {
        if (p.id === shown) continue;
        const detail = await get(
          `${BASE}/${id}/periods/${p.id}?platform=0&date=${date}`,
        );
        for (const it of itemsOf(detail)) all.push({ hall, item: it });
      }
    } catch (e) {
      meta.push({ hall, error: String(e) });
    }
  }

  // ---- 1. every distinct filter, by type ----------------------------------
  const filters = {};
  for (const { item } of all) {
    for (const f of item.filters ?? []) {
      const key = JSON.stringify([f.type, f.name]);
      filters[key] ??= { type: f.type, name: f.name, count: 0, ids: new Set() };
      filters[key].count++;
      filters[key].ids.add(f.id ?? "");
    }
  }
  const filterRows = Object.values(filters)
    .map((f) => ({ ...f, ids: [...f.ids] }))
    .sort((a, b) => a.type.localeCompare(b.type) || b.count - a.count);

  // ---- 2. the starred-vs-unstarred question -------------------------------
  // If starred means "trace / from a sub-recipe", then for a starred allergen
  // we expect the allergen word NOT to appear in the visible ingredient text,
  // and we expect the item to contain a `^` sub-recipe marker. Unstarred
  // allergens should more often be visible in the text.
  const starEvidence = { starred: [], unstarred: [] };
  for (const { hall, item } of all) {
    const ing = (item.ingredients ?? "").toLowerCase();
    const hasCaret = (item.ingredients ?? "").includes("^");
    for (const f of item.filters ?? []) {
      if (f.type !== "allergen") continue;
      const starred = f.name.endsWith("*");
      const word = f.name.replace(/\*$/, "").toLowerCase();
      starEvidence[starred ? "starred" : "unstarred"].push({
        hall,
        item: item.name,
        allergen: f.name,
        wordVisibleInIngredients: ing.includes(word),
        itemHasSubRecipeCaret: hasCaret,
      });
    }
  }
  const rate = (rows, key) =>
    rows.length ? +(rows.filter((r) => r[key]).length / rows.length).toFixed(3) : null;

  const starSummary = {
    starred: {
      n: starEvidence.starred.length,
      visibleInIngredients: rate(starEvidence.starred, "wordVisibleInIngredients"),
      hasSubRecipeCaret: rate(starEvidence.starred, "itemHasSubRecipeCaret"),
    },
    unstarred: {
      n: starEvidence.unstarred.length,
      visibleInIngredients: rate(starEvidence.unstarred, "wordVisibleInIngredients"),
      hasSubRecipeCaret: rate(starEvidence.unstarred, "itemHasSubRecipeCaret"),
    },
    readIt:
      "If 'starred' shows a much LOWER visibleInIngredients rate and a HIGHER " +
      "hasSubRecipeCaret rate than 'unstarred', the trace/sub-recipe reading " +
      "is supported. If the two rows look alike, it is NOT supported and the " +
      "star means something else — do not ship a filter based on it.",
  };

  // ---- 3. does an item ever contradict itself? ----------------------------
  // Same allergen present both starred and unstarred on one item would mean
  // the two are genuinely different claims, not sloppy data entry.
  const contradictions = [];
  for (const { hall, item } of all) {
    const names = (item.filters ?? [])
      .filter((f) => f.type === "allergen")
      .map((f) => f.name);
    for (const n of names) {
      if (n.endsWith("*") && names.includes(n.slice(0, -1))) {
        contradictions.push({ hall, item: item.name, allergen: n });
      }
    }
  }

  // ---- 4. is custom_allergens ever populated? -----------------------------
  const withCustom = all
    .filter(({ item }) => (item.custom_allergens ?? []).length)
    .map(({ hall, item }) => ({ hall, item: item.name, value: item.custom_allergens }));

  // ---- 5. probe the server-side allergen filter parameter -----------------
  // `allergen_filter` comes back as a top-level boolean. If a request param
  // flips it, there may be a server-side filter we could use instead of
  // filtering client-side. Tried against the first open hall only.
  const openHall = meta.find((m) => m.closed === false && !m.error);
  const paramProbe = [];
  if (openHall) {
    const id = HALLS[openHall.hall];
    const variants = [
      `${BASE}/${id}/periods?platform=0&date=${date}&allergen_filter=true`,
      `${BASE}/${id}/periods?platform=0&date=${date}&allergens=Milk`,
      `${BASE}/${id}/periods?platform=0&date=${date}&filter_allergens=Milk`,
    ];
    const baseline = await get(`${BASE}/${id}/periods?platform=0&date=${date}`);
    const baseCount = itemsOf(baseline).length;
    for (const url of variants) {
      try {
        const r = await get(url);
        paramProbe.push({
          param: url.split("&").slice(2).join("&"),
          allergen_filter: r.allergen_filter,
          items: itemsOf(r).length,
          baselineItems: baseCount,
          changedAnything:
            itemsOf(r).length !== baseCount ||
            r.allergen_filter !== baseline.allergen_filter,
        });
      } catch (e) {
        paramProbe.push({ param: url, error: String(e) });
      }
    }
  }

  const out = {
    date,
    hallsProbed: meta,
    totalItems: all.length,
    distinctFilters: filterRows,
    allFilterIdsEmpty: filterRows.every((f) => f.ids.every((i) => i === "")),
    starSummary,
    starEvidenceSample: {
      starred: starEvidence.starred.slice(0, 12),
      unstarred: starEvidence.unstarred.slice(0, 12),
    },
    contradictions,
    customAllergensPopulated: withCustom,
    paramProbe,
  };

  window.__probe = out;
  console.log("%c=== allergen probe ===", "font-weight:bold");
  console.log(`date ${out.date} · ${out.totalItems} items · ${meta.length} halls`);
  console.table(meta);
  console.table(
    filterRows.map((r) => ({ type: r.type, name: r.name, count: r.count })),
  );
  console.log("star hypothesis:", starSummary);
  console.log("same allergen both starred and unstarred on one item:", contradictions);
  console.log("custom_allergens populated:", withCustom);
  console.table(paramProbe);
  console.log(
    "%cFull object on window.__probe — copy with: copy(JSON.stringify(__probe,null,2))",
    "color:#800000",
  );
  return out;
})();
