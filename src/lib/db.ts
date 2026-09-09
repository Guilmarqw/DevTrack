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

function createClient() {
  return new PrismaClient({
    adapter: new PrismaMariaDb(connectionString!),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
