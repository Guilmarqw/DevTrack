import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

// Auth.js v5 with the Credentials provider. Credentials only supports JWT
// sessions — database sessions are not available with it — so there are no
// Account/Session tables and the whole session lives in a signed cookie.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });

        // Compare against a dummy hash when the user is missing so a wrong
        // email and a wrong password take the same amount of time.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the request that signs in; afterwards the
      // claims ride along in the cookie.
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});

// bcrypt hash of a value nobody can supply, used purely to equalise timing.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DvW1Y3jJ1p7hEoJ9tPHVBnCqE3Pu6";

export type SessionRole = Role;
