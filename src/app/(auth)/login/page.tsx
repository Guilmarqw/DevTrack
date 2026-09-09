import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in · DevTrack" };

export default async function LoginPage() {
  // Already signed in — no reason to show the form.
  if (await getSessionUser()) redirect("/dashboard");

  return <AuthForm mode="login" action={loginAction} />;
}
