@AGENTS.md

# DevTrack

A personal developer analytics dashboard. Users upload project folders or
zipped codebases; DevTrack parses them and tracks engineering metrics over
time (LOC, language mix, completion %, dependencies, detected stack).

## Scope: local-only

This app runs entirely on localhost for personal use. No cloud deployment, no
public access, no external hosting. Optimize for local development speed,
offline reliability, and simplicity over production hardening. Do not add
rate limiting, CSP headers, CDN config, secret rotation, or horizontal-scaling
concerns unless asked.

Role for this codebase: senior full-stack engineer with a UI/UX minimalist
bias — spare layouts, restrained color, generous whitespace, no decoration
that doesn't carry information.

## Tech stack

Use exactly this. If something is genuinely technically incompatible, say so
and explain before substituting.

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Backend | Next.js API route handlers only — no separate Express server |
| Database | MariaDB 10.4 on port 3306, via the XAMPP control panel |
| ORM | Prisma 7 (pinned exact), `provider = "mysql"`, MariaDB driver adapter |
| Upload parsing | Busboy for multipart streams; `unzipper`/`yauzl` for `.zip` |
| Charts | Recharts |
| Upload UI | React Dropzone |
| Auth | Auth.js v5, Credentials provider, role on the session |
| Styling | Tailwind CSS v4 |
| Package manager | npm |

### Decisions already settled — do not re-litigate

- **MySQL family, not Postgres.** Prisma provider is `mysql`. The actual server
  is MariaDB 10.4 from XAMPP — Docker is not installed on this machine, and
  `docker-compose.yml` is a documented fallback only, not the running setup.
  Note the MySQL consequences: `@db.Text` for long strings, no native enum
  arrays, no `citext`, index-length limits on long `VARCHAR` keys.
- **API routes, not Express.** One process, one `npm run dev`, no CORS, no
  proxy. This rules out Multer (Express-only middleware) — use Busboy or the
  native `request.formData()` in route handlers.
- **Auth.js Credentials provider.** Local signup with a hashed password. No
  email verification, no OAuth providers, no SMTP.
- **Prisma 7 uses a driver adapter, not a bundled query engine.** The connection
  lives in `src/lib/db.ts` via `PrismaMariaDb`; the `datasource` block in the
  schema has no `url`. The CLI reads `DATABASE_URL` through `prisma7.config.ts`,
  the config file Prisma 7 generates and auto-discovers. The generated client
  goes to `src/generated/prisma` and is gitignored, so `npm run db:generate` is
  required after a fresh clone.
- **Prisma is pinned to exact 7.10.0.** npm's `latest` tag currently resolves to
  `8.0.0-rc`, whose CLI is a different, platform-oriented command surface. Do
  not unpin.
- **No `next/font/google`.** It fetches fonts at build time, which breaks the
  offline-reliability goal. Use the system font stack defined in `globals.css`.
- **Tailwind v4.** Configuration is CSS-first in `src/app/globals.css` via
  `@theme`. There is no `tailwind.config.js` and none should be added.
  **A `@theme` variable is only emitted when its name appears literally in
  scanned source.** A name built at runtime — `var(--color-rank-${n})` — is
  invisible to the scanner, so the variable is dropped and every reference
  resolves to nothing. It fails silently, and only in the mode whose values
  came from `@theme`: the rank colours survived in dark mode, where they are
  hand-written plain CSS, and vanished in light. A token read through a
  computed name belongs in a plain `:root` rule, which is always emitted.
  `@theme` must also stay top-level — nesting one inside `@media` crashed the
  Turbopack PostCSS worker with `0xc0000142`, and the giveaway is that
  `npm run build` still passes while every page returns a 500. Dark mode
  overrides those same properties in an ordinary `:root` media query instead.
- **Next.js 16 specifics.** `params`, `searchParams`, `cookies()`, and
  `headers()` are all async and must be awaited. `middleware.ts` is now
  `proxy.ts` exporting a `proxy` function, and it cannot use the edge runtime.
  Turbopack is the default bundler. When unsure about a Next 16 API, read
  `node_modules/next/dist/docs/` rather than relying on memory.
- **`AGENTS.md` is managed by `next dev`.** It rewrites the marked block on
  every start. Leave it alone; project instructions belong in this file. Never
  bulk-copy files over the repo root without checking for collisions — that is
  how this file got clobbered once already.

## Auth

Sessions are JWTs in a signed, encrypted, HttpOnly cookie (`authjs.session-token`).
`id` and `role` are put on the token in the `jwt` callback and copied onto the
session in the `session` callback.

- **`src/proxy.ts`, not `proxy.ts`.** With a `src/` directory the file must sit
  beside `app`. At the repo root it is silently ignored — no error, the matcher
  just never runs.
- **The proxy is redirect UX only.** It checks that a session cookie is
  *present*, never that it is valid, so it does not have to load Auth.js and
  Prisma on every request. The real authorization boundary is `requireUser()` /
  `requireAdmin()` in `src/lib/session.ts`, and every protected page and route
  handler must call one of them. A forged cookie clears the proxy and is
  rejected there.
- **Self-signup always creates `USER`.** Admin comes from the seed or an
  existing admin, never from form input.
- **Restart the dev server after any migration.** The running server caches the
  generated Prisma client, so new models come back `undefined` until it
  restarts.
- **Restart the dev server if MySQL is restarted under it.** The Prisma client
  is cached on `globalThis` across HMR, and its pool does not recover when the
  server goes away and comes back — every query then fails with
  `pool timeout ... active=0 idle=0` for 10s until the dev server restarts.

## Tech tags and dependencies

Dependencies are **snapshot-scoped** and immutable, so dependency history comes
free. Tech tags are **project-scoped** because a person edits them.

Re-scan reconciliation (`reconcileTechTags` in `src/lib/upload/snapshot.ts`)
never overrules the owner:

- a tag with `dismissedAt` set stays dismissed — a re-scan must not resurrect a
  rejected guess;
- a `MANUAL` tag is never touched. "Confirm" promotes a `DETECTED` tag to
  `MANUAL`, and that is what makes it survive later scans;
- a `DETECTED` tag whose signal is gone is deleted, because it is derived data.

Detection rules match dependency names **exactly**, never by substring: a
substring match turns `eslint-plugin-react` into React and `next-auth` into
Next.js. Every tag carries an `evidence` string so a guess is auditable.

## Server actions

**Never pass a `.bind()`-ed server action to `useActionState`.** On Next 16.3.4
that combination writes to the database and then never closes its response on
the no-JS form-POST path; the request hangs until the client gives up. A bound
action on a plain `<form action={...}>` is fine, and an unbound action in
`useActionState` is fine — only the combination breaks. Those forms pass ids
through a hidden input instead, and `authorizeProject` re-checks the id, so
reading it from the body grants nothing.

Server-action POSTs also require an `Origin` header (CSRF protection), which
matters when testing them with curl.

## Loading, errors and 404s

- **`/projects/[projectId]` deliberately has no `loading.tsx`.** A route-level
  loading file wraps the route in a Suspense boundary, and Next then flushes
  the shell with a **200** before `notFound()` can run — from the page body or
  from `generateMetadata`. The right page renders under the wrong status. The
  dashboard keeps its skeleton because it has no not-found path.
- **`src/lib/db.ts` sets fail-fast driver timeouts.** Without them a dead MySQL
  leaves a page on its loading skeleton forever with no error at all; with them
  the request fails in a few seconds and `error.tsx` shows "start MySQL in
  XAMPP".
- `error.tsx` is a client component, so its text is absent from the SSR HTML —
  verify it in a browser, not with curl.
- Never use `outline-none` on a focusable control. The global `:focus-visible`
  ring in `globals.css` is the only focus affordance; a border-colour change
  alone is invisible on a button.

## Theme, motion and the splash

- **Theme** is `data-theme` on `<html>`, written by `BootScript` in `<head>`
  before first paint and read with `useSyncExternalStore` (never copied into
  state in an effect). Three states: light, dark, and absent = follow the OS.
  `<html>` needs `suppressHydrationWarning` because that script sets an
  attribute React also hydrates.
- **The splash is CSS-only.** It is server-rendered so it covers the first
  paint, and its own animation fades it out and leaves it `visibility: hidden;
  pointer-events: none`. **Never remove it with JavaScript** — it is a
  React-owned node, and deleting it throws
  `removeChild`/`insertBefore` NotFoundError on the next render.
- **React 19 hoists `<style>` out of `<noscript>`**, which is a hydration
  failure. Do not put a `<style>` tag inside `noscript`.
- **Scroll-driven `.reveal` is for the landing page only.** It re-hides when
  scrolled out of view, so on a dashboard it would hide text from Ctrl+F.
  Dashboard pages use on-load `.rise` / `.stagger`, which always end visible.
- Every animation only touches `transform` and `opacity`, and the
  `prefers-reduced-motion` block zeroes all durations, so nothing needs its
  own guard.

## Leaderboard and privacy

The leaderboard is the only place a standard user sees another account.
`getLeaderboard` may return a display name (falling back to the local part of
the email, never the address) and aggregate totals — **never project names,
file paths, or emails**. `User.showOnLeaderboard` opts out, and an opted-out
account is excluded entirely rather than anonymised, because an anonymous row
in a two-person instance is not anonymous.

Language colour swatches are deliberately absent from the leaderboard: a
colour map built from those totals would rank languages differently from the
analytics page, and "colour follows the entity" is the rule the chart palette
must keep.

## Uploads have no size limit

`src/lib/upload/stream.ts` parses multipart with Busboy straight off the
request stream and counts each file a chunk at a time; a zip is spooled to a
temp file and read by random access, because a zip's central directory is at
the end and cannot be read forward-only. **Do not reintroduce
`request.formData()`** — it buffers the whole upload, which is the only reason
size caps ever existed.

Two constraints the client must keep:

- each file's relative path is sent in a `paths` field **immediately before**
  its file part, so the server knows where bytes belong as they arrive;
- `projectId` travels in the **query string**, not the body, so the route can
  read `trackFiles` without consuming the stream.

Measured behaviour: one 300 MB file costs ~99 MB of server memory; the same
parse in plain Node holds a flat ~30-70 MB heap across 60,000 files. `next dev`
adds ~18 KB per file of its own instrumentation, so a 60,000-file upload needs
about a gigabyte of dev-server heap — it completes on a default heap, and that
cost is the dev server's, not the upload code's.

Byte counts are `BigInt` columns so a project has no size ceiling. Convert with
`Number()` at the query boundary — a bigint cannot be serialised into a client
component, and Number is exact to 9 PB.

## Findings

`src/lib/analyzer/findings.ts` reports what DevTrack can say is *wrong*, as
opposed to measured. Two kinds only: **syntax** (a structured file that does
not parse) and **hygiene** (facts about which files exist).

**It is not a linter or a type checker, and must not become one.** Those need
the whole tree on disk with its dependencies installed, and the editor that
wrote the code already runs them. Every rule here is answerable with certainty
from what the analyzer already holds, which is what makes "no findings" worth
anything. The panel says so in as many words — do not quietly widen the claim.

The governing rule is **a false positive is much worse than a false negative**.
One wrong "your secrets are exposed" teaches the owner to ignore the whole
panel. Concretely:

- `tsconfig.json` and friends are **JSONC** — comments and trailing commas are
  legal and ubiquitous. `relaxJsonc` blanks them out *without changing length*,
  so a reported line number still points at the file's own line. `package.json`
  stays strict, because npm is strict.
- A YAML file containing `{{` or `{%` is a template and is not judged; an
  `unknown tag` error (CloudFormation's `!Ref`) is not reported either.
  Multi-document YAML needs `loadAll`, not `load`.
- **TOML is deliberately not validated** — there is no parser in the tree, and
  a hand-rolled one would invent errors. The Prisma check is brace balance
  only, and its wording says exactly that.
- A body that stopped at its capture limit is a **prefix, not a file**. Parsing
  one would report a syntax error in a file that is fine, so `add()` compares
  `captured.length` against `file.bytes` and skips anything truncated.
- `.env.example` and friends exist to be committed and are never flagged.

`HygieneCollector` has **two** observation entry points and the distinction
matters: `observeRaw` sees every path including excluded ones, because
lockfiles are on the exclusion list and a collector fed only counted files
reports "no lockfile" for every project that has one. `observe` sees only
counted paths, so `node_modules/x/test/a.js` is not taken as evidence that
this project has tests.

Findings are **snapshot-scoped and immutable**, like `Dependency`. There is no
dismiss flag: a finding is derived from the code, so the way to clear one is to
fix the file and re-scan. That is the opposite of a `TechTag`, which is a guess
the owner is entitled to overrule.

`ProjectSnapshot.findingsScanned` exists because "nothing found" and "never
looked" are indistinguishable from an empty finding set, and every snapshot
predating the feature is the second. It defaults to false so the backfill is
correct. The panel checks rows *before* the flag, so a snapshot written between
the feature and the flag still renders correctly.

`--color-sev-*` live in plain `:root`, outside the categorical series scale,
for the same reason the rank colours do — "this file is broken" is not a data
series. They are picked for contrast, not vividness: `--color-series-4` amber
reaches only 2.2:1 on white and is unreadable as a label.

`js-yaml` is a direct dependency. It was already in the tree transitively,
which is not the same as being safe to import.

## Health, and per-project analysis

**The health indicator is not a score.** `src/lib/health.ts` reports the worst
thing the latest scan found — Needs attention / Minor issues / No issues found
/ Not scanned — plus the counts behind it. A number out of 100 would need
weights, and nothing in the data says whether an unignored `.env` is worth
twenty points or forty, so every weight would be invented. `detail` always
states what the level was derived from. Like the Findings panel, it checks
rows *before* `findingsScanned`, so a snapshot written between the two
features is not reported as unscanned while listing findings.

`src/lib/projectAnalysis.ts` is deliberately separate from
`getAccountAnalytics`. The account page answers "how much am I building, and
where"; the project section answers "what is *this* codebase made of, and
which way is it moving". A language mix across every project describes your
habits; the same mix inside one project describes its architecture. Keep them
apart — merged, the chart answers neither.

Composition by role reuses `LANGUAGE_INFO.role`, so it needs no new data. Two
honesty rules hold there:

- a per-day rate is **null** under a day of tracked history, because three
  re-scans in one afternoon extrapolate to tens of thousands of lines a day;
- `Other` — the analyzer's own catch-all — is surfaced as Unclassified rather
  than dropped. A project that is 40% unrecognised should say so.

## Deleting, adding files, and re-checking health

**Delete is a hard delete and every relation cascades** — snapshots, language
stats, per-file rows, dependencies, findings, tasks and the whole activity
feed. There is no archive, no undo, and nothing to rebuild from, because
DevTrack never kept the source. `DeleteProject` is therefore two-step: the
first click reveals real counts of what will go, and only the second submits.
The server re-checks a `confirm` field so the gate is not purely visual.

No `PROJECT_DELETED` activity entry exists and none should be added:
`ActivityLogEntry.projectId` is required and cascades, so the row would be
deleted by the same statement that wrote it.

**"Add files", "Check health" and "Re-scan" are all one flow**, and all three
buttons anchor to `#add-files`. That is not laziness — they genuinely need the
same thing. Findings are computed from file contents, and DevTrack stores
measurements rather than source, so **there is nothing on the machine to
re-scan**. A health check has to see the files again. The UI says so wherever
it offers the button; do not add a "re-check" that silently does less than the
reader expects, and do not imply stored data can be re-analysed.

"Check health" only appears when the latest snapshot is unscanned — a scanned
project is already showing its findings further down the page. The dashboard's
**Not health-checked** section lists exactly the projects where the answer is
unknown rather than good, and disappears when there are none.

## The upload scan log

`UploadScanLog` shows **real paths, not a fake typing effect**. The client
already holds every file's relative path and size and XHR reports true
bytes-sent, so the log is the actual send queue. `cursorIndex` lives in
`src/lib/uploadCursor.ts` — plain TypeScript, so it is testable without a JSX
runtime — and walks cumulative sizes rather than treating files as equal, or
one 300 MB file among a thousand small ones would make the log sprint to the
end and sit there.

Which file is in flight is an approximation, because multipart framing means
bytes-sent does not line up exactly with the sum of file sizes. That is why
nothing in the panel claims a file has *finished*: the log says "sending" and
the byte counter beside it is exact. The log is `aria-hidden` — the phase
label and counters are already in an `aria-live` region, and a path list
changing every few hundred milliseconds would flood it.

**`relativePathOf` strips a leading `./`.** react-dropzone reports paths as
`./a/b.ts` and the server's `normalizePath` drops that prefix, so leaving it on
the client meant the live log displayed a path the database never stored. The
same prefix used to reach `folderNameFrom`, whose first-segment rule then
produced projects literally named `.` — it now skips `.` and `..` segments.

## The landing hero animation

`src/components/HeroScan.tsx` types out a scan log and transforms it into the
snapshot it produced. The log's numbers come from the same `SNAPSHOT` constant
the card renders, so the two can never disagree.

- **CSS only, no client JavaScript.** Per-line delays are computed at render.
- **`clip-path` for the typing, not `width`.** The one deviation from the
  transform/opacity rule, and it keeps that rule's intent: clip-path is
  composited and never triggers layout, while animating width would reflow a
  text run 30 times a second. Monospace plus `steps(n)` where n is the
  character count lands the reveal on character boundaries.
- **The caret lives inside the clipped span.** Outside it, a clip-path does not
  change layout, so the caret sat at the end of the line's full width —
  floating in blank space above unrevealed text.
- **`START_MS` waits for the splash.** The splash covers the first paint and
  fades out over 620–980ms, so a sequence starting at 0 plays its first second
  behind an opaque overlay. Keep this above 980ms.
- **Every animation ends on the state that matters** — log gone, card shown —
  which is where reduced motion lands instantly.
- The reduced-motion block zeroes `animation-delay` as well as duration.
  Without that, a delay-built sequence still waits out its full choreography
  before snapping to the end.

Screenshotting this needs care: seeking animations with
`document.getAnimations()` also rewinds the splash back over the page, which
makes every early frame come out blank. Finish the splash's `devtrack-out` and
seek the rest.

## Code analysis

Language detection is a custom Linguist-style analyzer: file extension first,
then shebang and content heuristics for ambiguous or extensionless files.
Compute both bytes and lines per language.

Always exclude from every count: `node_modules/`, `.git/`, `dist/`, `build/`,
`.next/`, `out/`, `vendor/`, `target/`, `src/generated/`, lockfiles, minified
bundles (`*.min.js`), source maps, and any file that fails a binary sniff (NUL
byte in the first 8 KB).

## Data model

Prisma models: `User` (with `role`), `Project`, `ProjectSnapshot` (one row per
upload or re-scan, holding the LOC and language stats so history works),
`File` (per-file granularity, optional), `Task`, `ActivityLogEntry`,
`Dependency`, `TechTag` (frontend / backend / database / cloud / other).

Re-uploads **version** the project: each one creates a new `ProjectSnapshot`
rather than overwriting the last. Time-series charts read from the snapshot
series.

## Conventions

- Server Components by default; `"use client"` only where interactivity or a
  Recharts container requires it.
- Prisma access lives in server code only — never import `src/lib/db.ts` into a
  client component.
- Every project query is scoped by the session user; `admin` role bypasses the
  scope. Never return another user's project to a standard user.
- Uploads, task changes, and re-scans each write an `ActivityLogEntry`.

## Commands

Start MySQL from the XAMPP control panel first (or confirm `mysqld` is already
running on 3306). Then:

```
npm run db:generate   # regenerate the Prisma client into src/generated/prisma
npm run db:migrate    # apply schema changes
npm run db:seed       # demo admin + demo standard user
npm run db:studio     # browse data
npm run dev           # http://localhost:3000
npm run typecheck     # tsc --noEmit
npm run build         # must pass before a phase is called done
```

The database `devtrack` already exists locally (utf8mb4). The XAMPP root user
has no password, which is why `DATABASE_URL` has no credentials.

## Working style

State assumptions explicitly as you make them so they can be corrected. Ask a
clarifying question only when the answer would change the architecture;
otherwise make the reasonable senior-dev call and note it.
