---
name: devtrack
description: Advance the DevTrack build by one deliverable — scaffolding, Prisma schema, auth, upload pipeline, dashboard, tech detection, or polish. Use when asked to build, continue, or resume DevTrack, or to start the next DevTrack phase.
---

# DevTrack build workflow

The stack, data model, and conventions are in `CLAUDE.md` at the repo root —
read it first and treat it as settled. This skill governs *order* and *done-ness*.

## How to run a phase

1. Determine the current phase (see "Finding the current phase" below).
2. Announce which phase you're doing and what the previous one left assumed.
3. Implement that phase only. Do not start the next one.
4. Run the phase's exit checks. They must pass.
5. Report: what changed (file paths), key decisions, and every assumption you
   made — as a short list the user can correct before phase N+1.

Never batch phases together. A phase boundary is where the user gets to
redirect; skipping it wastes their review.

## Finding the current phase

Check the repo for the earliest phase whose exit checks fail:

| # | Phase | Done when |
| --- | --- | --- |
| 1 | Scaffolding | `package.json`, `prisma/schema.prisma`, `src/lib/db.ts`, `@theme` block in `globals.css` exist; `npm run typecheck` and `npm run build` pass; the running app reads `SELECT VERSION()` from MariaDB |
| 2 | Schema + seed | All models from CLAUDE.md present; `npx prisma migrate dev` clean; `npm run db:seed` creates a demo admin and demo standard user |
| 3 | Auth | Signup + login work for both roles; role reaches the session; unauthenticated dashboard access redirects |
| 4 | Upload pipeline | Dropzone → route handler → unzip/walk → language analyzer → a persisted `ProjectSnapshot`; verified with a real folder and a real `.zip` |
| 5 | Dashboard UI | Project list + detail page with language %, completion %, LOC, progress-over-time charts, activity feed, task list |
| 6 | Tech + dependencies | Stack inferred from config files and manifests; dependencies listed with versions; user can confirm/edit `TechTag`s |
| 7 | Polish | Every list/chart has an empty state and a loading state; upload and auth failures surface a readable message |

Phase 2 has a gate: **propose the Prisma schema and stop for review before
generating any migration.** Migrations are cheap to write and annoying to
unwind; a schema read-through is the cheapest correction point in the build.

## Notes per phase

**1 — Scaffolding.** MariaDB runs under XAMPP; Next runs on the host. Confirm
Prisma actually connects before calling the phase done — a scaffold that
builds but can't reach the DB is not done.

**4 — Upload pipeline.** This is the phase most likely to hide bugs. Test
with a genuinely messy input: nested `node_modules`, a binary asset, an
extensionless script with a shebang, a file with CRLF line endings, and a
zip whose entries share a single top-level directory. Guard against zip-slip
(entry paths escaping the extraction root) even though this is local-only —
it's a correctness bug, not just a security one.

**5 — Dashboard UI.** Before writing chart code, load the `dataviz` skill.
Minimalist bias: one accent color, axis labels over legends where a single
series allows it, no gridlines competing with the data.

**7 — Polish.** An empty state should say what to do next, not just "No data".
A project with zero snapshots is the common case on first run — make that
screen good.

## Completion percentage

Support both derivations: computed from tasks done vs. total, and a manually
set target. Store which mode a project uses on `Project`; don't infer it at
render time.
