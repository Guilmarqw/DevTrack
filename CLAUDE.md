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
`Dependency`, `TechTag` (frontend / backend / database / other).

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
