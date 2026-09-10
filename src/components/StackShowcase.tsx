/**
 * What DevTrack recognises, laid out by the part of a stack it belongs to.
 *
 * Every name here is taken from the real rule tables — `EXTENSION_LANGUAGES`
 * in `src/lib/analyzer/languages.ts` and `DEPENDENCY_RULES` / `FILE_RULES` in
 * `src/lib/analyzer/tech.ts`. If a rule is removed, the name must come out of
 * this list too: a landing page claiming detection that no longer happens is
 * worse than no landing page.
 *
 * A server component. There is nothing to interact with, so it ships no
 * client JavaScript.
 */

type Featured = { name: string; blurb: string };

type Category = {
  title: string;
  /** What this layer of a stack actually does. */
  intro: string;
  featured: Featured[];
  /** The rest, as plain names. */
  also: string[];
};

const CATEGORIES: Category[] = [
  {
    title: "Front end",
    intro:
      "Everything that runs in the browser — the structure, the styling and the code that makes a page respond to you.",
    featured: [
      {
        name: "HTML",
        blurb:
          "The markup every page is built from. Describes structure and meaning: headings, links, forms.",
      },
      {
        name: "CSS",
        blurb:
          "The styling layer — layout, colour, type, motion. What a page looks like, as opposed to what it contains.",
      },
      {
        name: "TypeScript",
        blurb:
          "JavaScript with a type system checked before the code runs, so whole classes of mistakes never ship.",
      },
      {
        name: "React",
        blurb:
          "Builds interfaces out of composable components. The most common way large front ends are structured.",
      },
    ],
    also: [
      "JavaScript",
      "Next.js",
      "Vue",
      "Nuxt",
      "Svelte",
      "SvelteKit",
      "Angular",
      "Solid",
      "Astro",
      "Tailwind CSS",
      "SCSS",
      "Sass",
      "Less",
      "styled-components",
      "React Native",
      "Swift",
      "Dart",
      "Recharts",
      "D3",
    ],
  },
  {
    title: "Back end",
    intro:
      "The server side: the code that answers requests, enforces rules and talks to your data.",
    featured: [
      {
        name: "Express",
        blurb:
          "The minimal Node web framework. Small enough to read in an afternoon, and still the default for JavaScript APIs.",
      },
      {
        name: "Django",
        blurb:
          "Python's batteries-included framework — routing, admin, migrations and an ORM in one piece.",
      },
      {
        name: "Go",
        blurb:
          "Fast compiles, easy concurrency, and a single binary at the end. Why so much infrastructure is written in it.",
      },
    ],
    also: [
      "Fastify",
      "Koa",
      "NestJS",
      "hapi",
      "Flask",
      "FastAPI",
      "Uvicorn",
      "Gunicorn",
      "Celery",
      "Ruby on Rails",
      "Sinatra",
      "Laravel",
      "Symfony",
      "Gin",
      "Echo",
      "Fiber",
      "Actix Web",
      "Axum",
      "Rocket",
      "GraphQL",
      "Apollo Server",
      "Socket.IO",
    ],
  },
  {
    title: "Database",
    intro:
      "Where the data lives, and the layer your code uses to reach it. DevTrack reads the engine out of your schema where it can.",
    featured: [
      {
        name: "PostgreSQL",
        blurb:
          "The default serious relational database: strict, extensible, and honest about constraints.",
      },
      {
        name: "MySQL / MariaDB",
        blurb:
          "The most widely deployed relational pair. What runs under most shared hosting and a great deal of production.",
      },
      {
        name: "Prisma",
        blurb:
          "Define your models once and get a typed client plus matching migrations. Names its own engine, so detection is exact.",
      },
    ],
    also: [
      "SQLite",
      "MongoDB",
      "Redis",
      "Drizzle",
      "TypeORM",
      "Sequelize",
      "Knex",
      "Mongoose",
      "SQLAlchemy",
      "Django ORM",
      "GORM",
      "Diesel",
      "SQLx",
      "Doctrine",
      "SQL",
      "Database migrations",
    ],
  },
  {
    title: "Cloud and hosting",
    intro:
      "Somebody else's servers. Often the only trace is a config file, which is exactly why DevTrack reads them.",
    featured: [
      {
        name: "AWS",
        blurb:
          "The largest cloud, and the most granular — detected from the SDK, a CDK app or a SAM template.",
      },
      {
        name: "Supabase",
        blurb:
          "Postgres with auth, storage and generated APIs on top. Recognised from the client library or a supabase/ directory.",
      },
      {
        name: "Firebase",
        blurb:
          "Google's app platform — Firestore, auth, functions, hosting. firebase.json alone is proof enough.",
      },
      {
        name: "Vercel",
        blurb:
          "Where a great many Next.js apps are deployed. A vercel.json needs no dependency to give it away.",
      },
    ],
    also: [
      "Netlify",
      "Cloudflare Workers",
      "Google Cloud",
      "Azure",
      "Firestore",
      "Firebase Functions",
      "AWS S3",
      "AWS Lambda",
      "AWS DynamoDB",
      "AWS CDK",
      "AWS Amplify",
      "Serverless Framework",
      "PlanetScale",
      "Neon",
      "Upstash",
      "Heroku",
      "Fly.io",
      "Railway",
      "Render",
      "Helm",
      "Terraform",
      "Stripe",
      "Twilio",
      "Resend",
      "SendGrid",
      "Cloudinary",
      "Sentry",
      "Algolia",
      "Clerk",
      "Auth0",
    ],
  },
  {
    title: "Build and run",
    intro:
      "How a project starts: what containerises it, what bundles it, and what runs on every push.",
    featured: [
      {
        name: "Docker",
        blurb:
          "A recipe for an image — base system, dependencies, start command — so the app runs the same everywhere.",
      },
      {
        name: "Vite",
        blurb:
          "The modern dev server and bundler. Near-instant reloads in development, optimised output for production.",
      },
      {
        name: "GitHub Actions",
        blurb:
          "Workflows that run on every push: tests, builds, deploys. Detected from .github/workflows.",
      },
    ],
    also: [
      "Docker Compose",
      "webpack",
      "esbuild",
      "Rollup",
      "Go modules",
      "Bundler",
      "Makefile",
      "CMake",
      "Dotenv",
      "Procfile",
    ],
  },
  {
    title: "Quality and the rest",
    intro:
      "Types, linting, tests and auth — the parts that are invisible until they are missing.",
    featured: [
      {
        name: "ESLint",
        blurb:
          "Catches the mistakes a compiler will not, and settles style arguments before review does.",
      },
      {
        name: "Auth.js",
        blurb:
          "Session and sign-in handling for JavaScript apps. What DevTrack itself uses.",
      },
    ],
    also: [
      "Prettier",
      "Jest",
      "Vitest",
      "Playwright",
      "Cypress",
      "pytest",
      "Passport",
      "Zod",
      "YAML",
      "JSON",
      "TOML",
      "Markdown",
    ],
  },
];

export function StackShowcase() {
  return (
    <section className="reveal border-t border-line">
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          What it recognises
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Out of the box: <strong className="font-medium text-ink">60 languages</strong>{" "}
          by extension, filename and shebang, and{" "}
          <strong className="font-medium text-ink">
            119 frameworks and tools
          </strong>{" "}
          read from your manifests and config files. Every match shows the
          evidence behind it, and you can confirm or dismiss any of them.
        </p>

        <div className="stagger mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-2">
          {CATEGORIES.map((category, index) => (
            <div
              key={category.title}
              // An odd number of cards leaves the last one alone beside a
              // column of empty space, so it spans the full width instead.
              className={
                CATEGORIES.length % 2 === 1 && index === CATEGORIES.length - 1
                  ? "lg:col-span-2"
                  : undefined
              }
            >
              <h3 className="text-sm font-medium">{category.title}</h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
                {category.intro}
              </p>

              <dl className="mt-4 space-y-2.5">
                {category.featured.map((item) => (
                  <div key={item.name} className="border-l border-line pl-3">
                    <dt className="text-xs font-medium">{item.name}</dt>
                    <dd className="mt-0.5 max-w-md text-xs leading-relaxed text-muted">
                      {item.blurb}
                    </dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-4 flex flex-wrap gap-1.5">
                {category.also.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 max-w-2xl text-xs leading-relaxed text-faint">
          Nothing here needs configuring, and nothing is guessed from a project
          name — a tag only appears when a manifest, a config file or a schema
          actually says so.
        </p>
      </div>
    </section>
  );
}
