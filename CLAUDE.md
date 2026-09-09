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
