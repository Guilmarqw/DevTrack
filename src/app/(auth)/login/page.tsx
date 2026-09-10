import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in · DevTrack" };

/**
 * Auth.js redirects a failed no-JS sign-in back here with ?error=..., so the
 * message has to be recovered from the query string. Without this the form
 * re-renders looking like nothing happened.
 */
const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Wrong email or password.",
  SessionRequired: "Please sign in to continue.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // Already signed in — no reason to show the form.
  if (await getSessionUser()) redirect("/dashboard");

  // Next 16: searchParams is async.
  const params = await searchParams;
  const raw = params?.error;
  const key = Array.isArray(raw) ? raw[0] : raw;

  const initialError = key
    ? (ERROR_MESSAGES[key] ?? "That sign-in could not be completed.")
    : null;

  return (
    <AuthForm mode="login" action={loginAction} initialError={initialError} />
  );
}
