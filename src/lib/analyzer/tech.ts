import { isExcludedPath } from "./exclude";
import type { RawEntry } from "./analyze";
import type { ParsedDependency } from "./dependencies";
import type { TechCategory } from "@/generated/prisma/enums";

export type DetectedTech = {
  name: string;
  category: TechCategory;
  /** Why DevTrack thinks so, shown next to the tag so a guess is auditable. */
  evidence: string;
};

/**
 * Dependency name -> the technology it implies.
 *
 * Matched exactly against the declared package name, never by substring: a
 * substring rule turns "eslint-plugin-react" into React and "next-auth" into
 * Next.js, which is how stack detectors end up confidently wrong.
 */
const DEPENDENCY_RULES: Record<string, { name: string; category: TechCategory }> = {
  // --- frontend frameworks & tooling
  react: { name: "React", category: "FRONTEND" },
  "react-dom": { name: "React", category: "FRONTEND" },
  next: { name: "Next.js", category: "FRONTEND" },
  vue: { name: "Vue", category: "FRONTEND" },
  nuxt: { name: "Nuxt", category: "FRONTEND" },
  svelte: { name: "Svelte", category: "FRONTEND" },
  "@sveltejs/kit": { name: "SvelteKit", category: "FRONTEND" },
  "@angular/core": { name: "Angular", category: "FRONTEND" },
  "solid-js": { name: "Solid", category: "FRONTEND" },
  astro: { name: "Astro", category: "FRONTEND" },
  "react-native": { name: "React Native", category: "FRONTEND" },
  tailwindcss: { name: "Tailwind CSS", category: "FRONTEND" },
  sass: { name: "Sass", category: "FRONTEND" },
  "styled-components": { name: "styled-components", category: "FRONTEND" },
  recharts: { name: "Recharts", category: "FRONTEND" },
  "d3": { name: "D3", category: "FRONTEND" },

  // --- backend frameworks
  express: { name: "Express", category: "BACKEND" },
  fastify: { name: "Fastify", category: "BACKEND" },
  koa: { name: "Koa", category: "BACKEND" },
  "@nestjs/core": { name: "NestJS", category: "BACKEND" },
  hapi: { name: "hapi", category: "BACKEND" },
  "socket.io": { name: "Socket.IO", category: "BACKEND" },
  graphql: { name: "GraphQL", category: "BACKEND" },
  "apollo-server": { name: "Apollo Server", category: "BACKEND" },
  django: { name: "Django", category: "BACKEND" },
  flask: { name: "Flask", category: "BACKEND" },
  fastapi: { name: "FastAPI", category: "BACKEND" },
  uvicorn: { name: "Uvicorn", category: "BACKEND" },
  gunicorn: { name: "Gunicorn", category: "BACKEND" },
  celery: { name: "Celery", category: "BACKEND" },
  rails: { name: "Ruby on Rails", category: "BACKEND" },
  sinatra: { name: "Sinatra", category: "BACKEND" },
  "laravel/framework": { name: "Laravel", category: "BACKEND" },
  "symfony/framework-bundle": { name: "Symfony", category: "BACKEND" },
  "github.com/gin-gonic/gin": { name: "Gin", category: "BACKEND" },
  "github.com/labstack/echo/v4": { name: "Echo", category: "BACKEND" },
  "github.com/gofiber/fiber/v2": { name: "Fiber", category: "BACKEND" },
  actix: { name: "Actix", category: "BACKEND" },
  "actix-web": { name: "Actix Web", category: "BACKEND" },
  axum: { name: "Axum", category: "BACKEND" },
  rocket: { name: "Rocket", category: "BACKEND" },

  // --- databases, ORMs and drivers
  prisma: { name: "Prisma", category: "DATABASE" },
  "@prisma/client": { name: "Prisma", category: "DATABASE" },
  "drizzle-orm": { name: "Drizzle", category: "DATABASE" },
  typeorm: { name: "TypeORM", category: "DATABASE" },
  sequelize: { name: "Sequelize", category: "DATABASE" },
  knex: { name: "Knex", category: "DATABASE" },
  mongoose: { name: "Mongoose", category: "DATABASE" },
  mongodb: { name: "MongoDB", category: "DATABASE" },
  mysql: { name: "MySQL", category: "DATABASE" },
  mysql2: { name: "MySQL", category: "DATABASE" },
  mariadb: { name: "MariaDB", category: "DATABASE" },
  "@prisma/adapter-mariadb": { name: "MariaDB", category: "DATABASE" },
  pg: { name: "PostgreSQL", category: "DATABASE" },
  postgres: { name: "PostgreSQL", category: "DATABASE" },
  psycopg2: { name: "PostgreSQL", category: "DATABASE" },
  "psycopg2-binary": { name: "PostgreSQL", category: "DATABASE" },
  pymysql: { name: "MySQL", category: "DATABASE" },
  sqlite3: { name: "SQLite", category: "DATABASE" },
  "better-sqlite3": { name: "SQLite", category: "DATABASE" },
  redis: { name: "Redis", category: "DATABASE" },
  ioredis: { name: "Redis", category: "DATABASE" },
  sqlalchemy: { name: "SQLAlchemy", category: "DATABASE" },
  "django-orm": { name: "Django ORM", category: "DATABASE" },
  diesel: { name: "Diesel", category: "DATABASE" },
  sqlx: { name: "SQLx", category: "DATABASE" },
  "gorm.io/gorm": { name: "GORM", category: "DATABASE" },
  "doctrine/orm": { name: "Doctrine", category: "DATABASE" },

  // --- everything else worth naming
  typescript: { name: "TypeScript", category: "OTHER" },
  eslint: { name: "ESLint", category: "OTHER" },
  prettier: { name: "Prettier", category: "OTHER" },
  jest: { name: "Jest", category: "OTHER" },
  vitest: { name: "Vitest", category: "OTHER" },
  "@playwright/test": { name: "Playwright", category: "OTHER" },
  cypress: { name: "Cypress", category: "OTHER" },
  pytest: { name: "pytest", category: "OTHER" },
  webpack: { name: "webpack", category: "OTHER" },
  vite: { name: "Vite", category: "OTHER" },
  esbuild: { name: "esbuild", category: "OTHER" },
  rollup: { name: "Rollup", category: "OTHER" },
  "next-auth": { name: "Auth.js", category: "OTHER" },
  "@auth/core": { name: "Auth.js", category: "OTHER" },
  passport: { name: "Passport", category: "OTHER" },
  zod: { name: "Zod", category: "OTHER" },
};

/**
 * File-path signals. Each is either an exact repo-relative path, a basename,
 * or a prefix match on a config filename.
 */
const FILE_RULES: Array<{
  test: (path: string, base: string) => boolean;
  name: string;
  category: TechCategory;
  label: string;
}> = [
  {
    test: (_p, b) => b === "dockerfile" || b.startsWith("dockerfile."),
    name: "Docker",
    category: "OTHER",
    label: "Dockerfile",
  },
  {
    test: (_p, b) => b === "docker-compose.yml" || b === "compose.yaml" || b === "compose.yml" || b === "docker-compose.yaml",
    name: "Docker Compose",
    category: "OTHER",
    label: "compose file",
  },
  {
    test: (p) => p.startsWith(".github/workflows/"),
    name: "GitHub Actions",
    category: "OTHER",
    label: ".github/workflows",
  },
  {
    test: (_p, b) => b.startsWith("next.config."),
    name: "Next.js",
    category: "FRONTEND",
    label: "next.config",
  },
  {
    test: (_p, b) => b.startsWith("tailwind.config."),
    name: "Tailwind CSS",
    category: "FRONTEND",
    label: "tailwind.config",
  },
  {
    test: (_p, b) => b.startsWith("vite.config."),
    name: "Vite",
    category: "OTHER",
    label: "vite.config",
  },
  {
    test: (_p, b) => b === "tsconfig.json",
    name: "TypeScript",
    category: "OTHER",
    label: "tsconfig.json",
  },
  {
    test: (_p, b) => b === "manage.py",
    name: "Django",
    category: "BACKEND",
    label: "manage.py",
  },
  {
    test: (_p, b) => b === "gemfile",
    name: "Bundler",
    category: "OTHER",
    label: "Gemfile",
  },
  {
    test: (_p, b) => b === "go.mod",
    name: "Go modules",
    category: "OTHER",
    label: "go.mod",
  },
  {
    test: (_p, b) => b === "terraform.tf" || b.endsWith(".tf"),
    name: "Terraform",
    category: "OTHER",
    label: "Terraform files",
  },
  {
    test: (p) => /(^|\/)migrations\//.test(p),
    name: "Database migrations",
    category: "DATABASE",
    label: "migrations directory",
  },
];

/** Prisma names its own datasource, so the real database is readable exactly. */
const PRISMA_PROVIDERS: Record<string, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  sqlite: "SQLite",
  sqlserver: "SQL Server",
  mongodb: "MongoDB",
  cockroachdb: "CockroachDB",
};

function basenameOf(path: string): string {
  return (path.split("/").pop() ?? path).toLowerCase();
}

const CATEGORY_ORDER: TechCategory[] = [
  "FRONTEND",
  "BACKEND",
  "DATABASE",
  "OTHER",
];

/**
 * Gathers stack signals one at a time.
 *
 * A collector rather than a single function because the streaming reader never
 * holds the whole tree: it sees one path, and occasionally one file's body, at
 * a time. Evidence for the same technology merges as it arrives, so a tag can
 * still cite several independent signals.
 */
export class TechCollector {
  private readonly found = new Map<string, DetectedTech>();

  add(name: string, category: TechCategory, evidence: string): void {
    const key = `${category}:${name}`;
    const existing = this.found.get(key);
    if (!existing) {
      this.found.set(key, { name, category, evidence });
      return;
    }
    // Several signals for one technology is a stronger result, so keep them
    // all — capped so the evidence line stays readable.
    const parts = existing.evidence.split(", ");
    if (!parts.includes(evidence) && parts.length < 3) {
      existing.evidence = `${existing.evidence}, ${evidence}`;
    }
  }

  /** Config-file signals, from the path alone. Safe to call for every file. */
  addPath(path: string): void {
    if (isExcludedPath(path)) return;
    const base = basenameOf(path);

    for (const rule of FILE_RULES) {
      if (rule.test(path, base)) this.add(rule.name, rule.category, rule.label);
    }

    if (base === "schema.prisma") {
      this.add("Prisma", "DATABASE", "prisma/schema.prisma");
    }
  }

  /** Reads the real database out of a Prisma datasource block. */
  addPrismaSchema(contents: string): void {
    const provider = /provider\s*=\s*"([a-z]+)"/i.exec(contents);
    if (!provider) return;
    const mapped = PRISMA_PROVIDERS[provider[1].toLowerCase()];
    if (mapped) {
      this.add(mapped, "DATABASE", `schema.prisma provider "${provider[1]}"`);
    }
  }

  addDependency(dep: ParsedDependency): void {
    const rule =
      DEPENDENCY_RULES[dep.name.toLowerCase()] ?? DEPENDENCY_RULES[dep.name];
    if (!rule) return;
    this.add(
      rule.name,
      rule.category,
      `${basenameOf(dep.sourceFile)}: ${dep.name}`,
    );
  }

  finish(): DetectedTech[] {
    return [...this.found.values()].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
    );
  }
}

/**
 * Infers the stack from declared dependencies plus config-file presence.
 *
 * Array-based, kept for the test suite and any caller that already holds the
 * whole tree; the streaming reader drives TechCollector directly.
 */
export function detectTech(
  entries: RawEntry[],
  dependencies: ParsedDependency[],
): DetectedTech[] {
  const collector = new TechCollector();

  for (const dep of dependencies) collector.addDependency(dep);

  for (const entry of entries) {
    collector.addPath(entry.path);
    if (
      !isExcludedPath(entry.path) &&
      basenameOf(entry.path) === "schema.prisma"
    ) {
      collector.addPrismaSchema(entry.content.toString("utf8"));
    }
  }

  return collector.finish();
}
