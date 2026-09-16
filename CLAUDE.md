# UChicagoMacros — working notes for Claude

A client-side React + TypeScript + Vite app showing today's UChicago dining hall
menus with macros, plus a plate builder. No backend, by necessity — see the spec.

## Superpowers workflow

This project is developed with the **superpowers** workflow, and its artifacts
live in the repo at `docs/superpowers/`:

```text
docs/superpowers/specs/   design documents — what and why, with verified facts
docs/superpowers/plans/   implementation plans — task-by-task, checkbox tracked
```

Follow it for any non-trivial change:

1. **Read the spec first.** `docs/superpowers/specs/2026-08-29-dining-menu-app-design.md`
   is the source of truth for architecture and constraints. It records facts
   that were *verified by observation*, not assumed. Do not contradict it from
   memory; if reality has changed, update the spec and say so.
2. **Write a plan before implementing.** One file per milestone, named
   `YYYY-MM-DD-<slug>.md`, in the format the existing plans use: goal,
   architecture, file table, numbered tasks with `- [ ]` steps, a "Done when"
   list, and an explicit "Deliberately not in this milestone" section.
3. **Work the plan task by task**, ticking boxes as steps land.
4. **Record what the plan got wrong.** When implementation turns up a decision
   the plan did not anticipate, add it to an "Implementation notes" section
   rather than silently diverging, and pin it with a test.

If the `superpowers` plugin is installed in the session, use its
`brainstorming`, `writing-plans`, and `subagent-driven-development` /
`executing-plans` skills. When it is not, follow the conventions above by hand —
the repo's documented workflow does not depend on the plugin being present.

## Architectural rules that are not negotiable

These come from the spec and have cost real work to establish:

- **No server may fetch the Dine On Campus API.** Datacenter IPs get Cloudflare
  403s on every host. The app works *because* requests come from the student's
  browser. No SSR, no edge functions, no cron, no backend proxy.
- **v1 (`api.dineoncampus.com/v1`), not v4.** v4 sends no CORS header. v1 uses
  snake_case (`value_numeric`, not `valueNumeric`); examples found online are
  often v4 and will not apply.
- **A missing macro is `null`, never `0`.** An item with unknown protein is not
  a zero-protein item. This holds through parsing, rendering, sorting,
  filtering, and the optimizer, which excludes such items entirely.
- **`src/domain/` is pure.** No React import, no `fetch`, no `localStorage`, no
  clock, no randomness. That is what makes it testable against fixtures, and it
  is why `plate.ts` can have property tests at all.

## Conventions

- Tests are fixture-driven: real captured API responses in `tests/fixtures/`.
  Do not regenerate them casually — they encode observed upstream quirks.
- One test file per concern, so a failure names what broke:
  `plate.test.tsx` is the manual plate, `plate-optimizer.test.ts` is the pure
  optimizer, `suggest.test.tsx` is the suggestion UI.
- Tie-breaking in the optimizer is deterministic by input order. A suggestion
  that changes between identical clicks reads as broken.
- When a constraint produces a surprising-but-correct result, assert it in a
  test with a comment saying why, so it reads as a decision rather than a bug.

## Verify before claiming done

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

All four must be clean. CI runs the same gate before publishing to Pages.
