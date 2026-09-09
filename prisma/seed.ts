import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import "dotenv/config";

// The seed runs outside Next, so it builds its own client rather than reusing
// src/lib/db.ts (which is written for the dev-server module cache).
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

const db = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

// Local-only fixtures. These credentials are meant to be public — they exist so
// there is something to log in with on a machine only you can reach.
const DEMO_PASSWORD = "demo1234";

const ACCOUNTS = [
  {
    email: "admin@devtrack.local",
    name: "Demo Admin",
    role: "ADMIN" as const,
  },
  {
    email: "dev@devtrack.local",
    name: "Demo Developer",
    role: "USER" as const,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const account of ACCOUNTS) {
    // Upsert so re-running the seed is safe and does not reset a password you
    // may have changed by hand — only the name and role are re-asserted.
    const user = await db.user.upsert({
      where: { email: account.email },
      update: { name: account.name, role: account.role },
      create: { ...account, passwordHash },
    });
    console.log(`  ${user.role.padEnd(5)}  ${user.email}`);
  }

  console.log(`\n  password for both: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
