"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { normalizeEmail, validateSignup } from "@/lib/validation";

export type AuthFormState = { error: string | null };

const GENERIC_SIGNIN_ERROR = "Wrong email or password.";

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    // On success this throws a redirect, which must reach Next untouched —
    // hence the narrow `AuthError` check and the rethrow below.
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: GENERIC_SIGNIN_ERROR };
    }
    throw error;
  }
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const invalid = validateSignup({ email, password, name });
  if (invalid) return { error: invalid };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "That email is already registered." };

  try {
    // Self-signup always creates a standard user. Admin is granted by the
    // seed or by an existing admin — never by whoever fills in the form.
    await db.user.create({
      data: {
        email,
        name: name || null,
        passwordHash: await bcrypt.hash(password, 10),
        role: "USER",
      },
    });
  } catch (error) {
    // Lost the race against a concurrent signup on the same address.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "That email is already registered." };
    }
    throw error;
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      // The account exists but sign-in failed, so send them to log in by hand
      // rather than leaving them on a form that looks like it failed.
      return { error: "Account created. Please log in." };
    }
    throw error;
  }
}
