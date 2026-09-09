import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata = { title: "Create account · DevTrack" };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return <AuthForm mode="signup" action={signupAction} />;
}
