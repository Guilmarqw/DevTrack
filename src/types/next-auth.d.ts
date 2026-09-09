import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Teaches Auth.js about the two extra claims DevTrack puts on the token, so
// `session.user.role` is typed rather than `any` at every call site.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

// The callbacks are typed against @auth/core/jwt; `next-auth/jwt` is a
// re-export, so both need the augmentation to keep call sites and the
// callback signatures in agreement.
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
