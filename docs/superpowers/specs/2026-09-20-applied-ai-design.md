# UChicagoMacros — Applied AI Design

**Date:** 2026-09-20
**Owner:** Zhikang (Robert) Rong
**Status:** Design proposed. No implementation started.

**Depends on:** `2026-08-29-dining-menu-app-design.md` (the base spec). Section
references below point at it. §2.7 and the corrected §5.4 land with the
`docs/v1-payload-corrections` branch; the M2 entrée deferral is in
`plans/2026-09-16-m2-plate-builder.md`.

---

## 1. What this is

Two model-backed features, and the first backend this project has had.

1. **M4 — Dish type classification.** Label each dish entrée / side / dessert /
   beverage / condiment, so the plate optimizer can enforce the constraint it
   was forced to skip.
2. **M5 — Natural language macro targets.** Turn *"high protein, vegetarian,
   under 600 calories"* into the structured targets and constraints
   `suggestPlate` already accepts.

Both exist because a specific thing in the shipped code is worse without them.
Neither is a model bolted onto a working feature to have used a model.

---

## 2. Why these two

### 2.1 The optimizer is missing a constraint because the data lacks a field

Base spec §6 lists "at most one item from entrée-type categories" among the
rules that keep a suggested plate edible. The M2 plan shipped without it, for a
reason worth quoting:

> It needs a classification of which stations count as entrées, and the API
> returns station names as free text with no type field. Guessing from name
> substrings would be wrong in ways users cannot see.

That is a labelling problem with no labels. The station names observed so far —
`Sweet Shoppe`, `Breakfast Cereal`, `Create`, `Kitchen` — carry no reliable
signal, and `Create` in particular spans a yogurt and an overnight-oats bowl.
Dish name plus ingredient list does carry the signal. That is what a classifier
is for.

Without it the optimizer can return a plate that is numerically excellent and
socially absurd — the captured Baker fixture at an 800 kcal target produces
apple strudel, overnight oats, two yogurts, and a sausage patty. Every
constraint holds. Nobody eats that.

### 2.2 The macro-target form is the weakest part of the shipped UI

Four numeric inputs demand the user already know their targets as numbers.
"High protein, not too heavy" is how people actually think, and `suggestPlate`
already takes a structured `(MacroTargets, PlateConstraints)` pair. A parser
between the two is a thin, well-defined translation with a real UX payoff —
and with M3's dietary labels shipped, it can set those too.

### 2.3 What this is not for

**No model goes near the allergen `*` marker.** §2.7 leaves its meaning
unconfirmed and forbids shipping a safety-asserting filter on the inferred
reading. A model guessing at it is strictly worse than the current honest
"we don't know": it would launder a guess into something that reads like an
answer. The `*` question is resolved by asking Dine On Campus, not by
inference. This is not a tradeoff to revisit.

---

## 3. Architecture

Two different shapes, for two different reasons.

```
M4  offline, at build time          M5  runtime, per query
┌──────────────────────┐            ┌──────────────────────┐
│ scripts/classify.mjs │            │ browser              │
│  Batch API           │            │   "high protein…"    │
│  ↓                   │            │        ↓             │
│ dish-types.json      │            │ POST /api/parse      │
│  (committed)         │            │        ↓             │
└──────────┬───────────┘            │ proxy (holds key)    │
           │                        │   structured output  │
           ▼                        │        ↓             │
   bundled into the app             │ MacroTargets + …     │
   zero runtime cost                └──────────┬───────────┘
   zero key exposure                           ▼
                                        suggestPlate() — unchanged
```

**M4 needs no server.** Classification is a pure function of a dish, dishes
repeat across days, and the result never changes. Run it offline, commit the
artifact, ship it as static JSON. No key in the browser, no request in the hot
path, no cost per visit.

**M5 does need one**, because a browser-side key is a published key. The proxy
is small — validate, call, return — and it is the honest answer to "is this
full stack": it exists because a secret has to live somewhere, not because a
resume wanted a backend.

### 3.1 What the proxy must not become

Base spec §2.2 is unchanged and non-negotiable: **no server may fetch the Dine
On Campus API.** Datacenter IPs get Cloudflare 403s. The proxy talks to
Anthropic and to nothing else. If a future change has it fetching menus, the
app breaks in production while working locally — the exact failure §4 of the
base spec warns about.

### 3.2 Deployment

The static app stays on GitHub Pages. The proxy goes anywhere that runs a small
Node service — Fly, Railway, Render, or a serverless function. Pages cannot host
it, so this is the first piece of infrastructure the project has needed.

---

## 4. Model choice and cost

Both features default to **Claude Opus 5** (`claude-opus-5`, 1M context,
$5/MTok in, $25/MTok out). Cheaper tiers exist — Sonnet 5 (`claude-sonnet-5`,
$2/$10) and Haiku 4.5 (`claude-haiku-4-5`, $1/$5) — and classification is the
kind of task where a smaller model often holds up. **That substitution is a
measurable question, and §6 is how to answer it.** Pick the model from the eval,
not from a guess about difficulty.

### 4.1 M4 cost is negligible

Classification runs once per *unique* dish, not per menu view. A term's distinct
dishes across four halls is plausibly a few hundred to a couple thousand. At
roughly 200 input and 50 output tokens each, 2,000 dishes is ~400K input and
~100K output — about $4.50 at Opus 5 rates, and **half that through the Batch
API**, which is the right fit since nothing is latency-sensitive. Re-runs only
cover dishes not already in the cache, so the steady-state cost is near zero.

Adaptive thinking is on by default on Opus 5 and its tokens bill as output, so
treat the figure above as a floor. Run `effort: "low"` for a per-dish
classification — this is not a reasoning-heavy task — and measure before
raising it.

> Do **not** set `thinking: {type: "disabled"}` on Opus 5. It has two
> documented failure modes: tool calls written into visible text instead of
> `tool_use` blocks, and `<thinking>` tags leaking into responses. Low effort
> with thinking on is both cheaper and safer.

### 4.2 M5 cost is per query, and small

A parse is a short system prompt plus one sentence in, a small JSON object out.
Fractions of a cent. The real constraints are latency and abuse, not price.

**Prompt caching is probably not available here.** The minimum cacheable prefix
is 512–4096 tokens depending on model, and a parsing system prompt plus a
handful of few-shot examples may land under it — in which case `cache_control`
silently does nothing. If the prompt does clear the threshold, cache it and
confirm with `usage.cache_read_input_tokens` on repeat requests; a zero there
across identical prefixes means it is not caching and the breakpoint is
decoration.

### 4.3 Structured output, not prose parsing

Both features want a typed object back, so use structured outputs —
`output_config: {format: {...}}` on `messages.create()`, or `messages.parse()`
to validate against the schema automatically. Do not use the deprecated
`output_format` parameter, and do not parse prose with a regex: the whole point
is that the boundary between model and `suggestPlate` is typed.

Where a tool definition is used instead, set `strict: true` on the tool
(alongside `name` / `description` / `input_schema`, **not** on `tool_choice`),
with `additionalProperties: false` and an explicit `required` list.

---

## 5. Trust boundary

The model's output is **untrusted input to a pure function**, not a command.

- Every parsed field is range-checked before it reaches `suggestPlate` — the
  same bounds `useTargets` already enforces on the numeric form. A model
  returning `calories: 50000` gets clamped or rejected, exactly as a user typing
  it would be.
- A label the parser emits that no dish carries is dropped, not passed through.
  M3 matches labels exactly so an upstream rename surfaces; a hallucinated label
  must not look like one.
- `suggestPlate` stays pure and unchanged. If the proxy is down, the numeric
  form still works. **The AI is an input method, never a dependency of the core
  feature.**
- The proxy validates before calling the API: length cap on the query, and rate
  limiting per IP. An unauthenticated endpoint holding a billed API key is an
  invitation, and the bill is the attack.

---

## 6. Evaluation

Both features are measurable, and shipping either without measuring it would
repeat the mistake the base spec's §2 was written to prevent.

### 6.1 M4 — classification accuracy

Hand-label a stratified sample of ~150 dishes drawn across all four halls and
every period. Report overall accuracy and the confusion matrix — the
entrée/side boundary is where errors will concentrate and is the one the
optimizer depends on.

Hold a separate test split back. Tune the prompt on train, report on test, and
report the test number as the headline.

**Then measure what it was for.** Re-run the optimizer over the fixtures with
and without the entrée constraint, and report both the deviation metric already
in `plate.ts` and a human judgement of whether each plate reads as a meal. A
classifier at 95% accuracy that does not improve plates has not earned its
place.

### 6.2 M5 — parse accuracy

Build a set of query → expected-struct pairs, including the awkward ones:
ambiguous ("light lunch"), contradictory ("high protein, low protein"),
out-of-scope ("what's open right now"), and adversarial ("ignore your
instructions"). Score exact match on the parsed object.

The out-of-scope and adversarial cases matter more than the easy ones. The
parser must decline rather than invent targets, and §5's validation is what
catches it when it does not.

---

## 7. Constraints and accepted risks

- **A new dish is unclassified until the next batch run.** Treat unknown as
  unconstrained rather than excluding the dish — a missing label must not make
  food disappear, the same principle as a missing macro being `null` and not
  zero.
- **The proxy is a new failure mode and a new cost centre.** Both features
  degrade to today's behaviour when it is down, and that path is tested, not
  assumed.
- **Classification is a judgement, not a fact.** Is a burrito an entrée? The
  labels are a heuristic for making plates look like meals, and the UI should
  not present them as nutritional truth.
- **Model outputs drift across versions.** The committed artifact pins the
  classification; re-running it is a reviewable diff, not a silent change.

---

## 8. Milestones

**M4 — Dish classifier.** Offline script, committed artifact, entrée constraint
in `plate.ts`, eval. No server, so it ships independently and carries no
runtime risk. Do this first.

**M5 — Natural language targets.** The proxy, the parser, the validation layer,
the query UI, the eval. Depends on nothing in M4 and can be deferred
indefinitely without stranding it.

---

## 9. Open questions

- **Which model.** Answer from §6.1, not from intuition. If Haiku 4.5 matches
  Opus 5 on the test split, take it.
- **Where the proxy lives**, and whether a serverless function or a small
  always-on service better fits the traffic (currently: almost none).
- **How the label taxonomy handles composites** — a grain bowl is an entrée, a
  side salad is not, and "bowl" appears in both.
- **Whether M5 is worth it at all** if nobody uses the numeric form either.
  Worth checking before building the only piece here that adds a server.

---

## 10. Non-goals

- **Any model output touching allergens.** §2.2 above. Not a tradeoff.
- Menu history and archival ingest — still out, still for the reasons in base
  spec §10, and not revived by having a backend.
- User accounts, authentication, or storing anything per-person. The proxy is
  stateless.
- A chat interface. The parser is a one-shot translation, not a conversation.
- Generating nutrition data, ingredients, or anything else the API did not say.
  The model labels and parses; it never invents food facts.
