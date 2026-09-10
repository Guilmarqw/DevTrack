import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 drives the database through a driver adapter rather than a bundled
// query engine, so the connection is configured here rather than in the schema.
// The local database is MariaDB 10.4 (XAMPP), which this adapter reports to
// Prisma as provider "mysql".
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

// Next dev reloads modules on every edit. Without this cache each reload would
// open a fresh pool and MariaDB would run out of connections within minutes.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Bounds how long a request will wait for the database.
 *
 * Without these the driver waits on a dead server long enough that a page sits
 * on its loading skeleton indefinitely — the reader gets no error, just a
 * permanent "loading". Failing in a few seconds lets the error boundary render
 * something actionable ("start MySQL in XAMPP") instead.
 *
 * Applied to the URL rather than .env so the setting cannot be lost by editing
 * the environment, while an explicit value in DATABASE_URL still wins.
 */
function withFailFastTimeouts(url: string): string {
  const parsed = new URL(url);
  const defaults: Record<string, string> = {
    connectTimeout: "3000",
    initializationTimeout: "3000",
    acquireTimeout: "5000",
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaMariaDb(withFailFastTimeouts(connectionString!)),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
