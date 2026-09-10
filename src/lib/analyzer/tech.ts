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

/**
 * Infers the stack from declared dependencies plus config-file presence.
 *
 * Every hit carries its evidence string, so the UI can show *why* a tag was
 * suggested and the reader can overrule a bad guess instead of trusting it.
 * Duplicate technologies collapse to one tag and the evidence is merged.
 */
export function detectTech(
  entries: RawEntry[],
  dependencies: ParsedDependency[],
): DetectedTech[] {
  const found = new Map<string, DetectedTech>();

  const add = (
    name: string,
    category: TechCategory,
    evidence: string,
  ) => {
    const key = `${category}:${name}`;
    const existing = found.get(key);
    if (!existing) {
      found.set(key, { name, category, evidence });
      return;
    }
    // Several signals for the same technology is a stronger result, so keep
    // them all — capped so the evidence line stays readable.
    const parts = existing.evidence.split(", ");
    if (!parts.includes(evidence) && parts.length < 3) {
      existing.evidence = `${existing.evidence}, ${evidence}`;
    }
  };

  for (const dep of dependencies) {
    const rule = DEPENDENCY_RULES[dep.name.toLowerCase()] ?? DEPENDENCY_RULES[dep.name];
    if (rule) {
      add(rule.name, rule.category, `${basenameOf(dep.sourceFile)}: ${dep.name}`);
    }
  }

  for (const entry of entries) {
    if (isExcludedPath(entry.path)) continue;
    const base = basenameOf(entry.path);

    for (const rule of FILE_RULES) {
      if (rule.test(entry.path, base)) {
        add(rule.name, rule.category, rule.label);
      }
    }

    if (base === "schema.prisma") {
      add("Prisma", "DATABASE", "prisma/schema.prisma");
      const provider = /provider\s*=\s*"([a-z]+)"/i.exec(
        entry.content.toString("utf8"),
      );
      const mapped = provider && PRISMA_PROVIDERS[provider[1].toLowerCase()];
      if (mapped) {
        add(mapped, "DATABASE", `schema.prisma provider "${provider![1]}"`);
      }
    }
  }

  const order: TechCategory[] = ["FRONTEND", "BACKEND", "DATABASE", "OTHER"];
  return [...found.values()].sort(
    (a, b) =>
      order.indexOf(a.category) - order.indexOf(b.category) ||
      a.name.localeCompare(b.name),
  );
}
