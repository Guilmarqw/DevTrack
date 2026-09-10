"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { AuthFormState } from "./actions";
import { PendingOverlay } from "@/components/PendingOverlay";

function SubmitButton({ label }: { label: string }) {
  // useFormStatus only reports the pending state of the form it is rendered
  // inside, so it has to live in its own component below the <form>.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="press mt-2 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

const fieldClass =
  "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus:border-accent";

const labelClass = "block text-xs font-medium text-muted";

export function AuthForm({
  mode,
  action,
  initialError = null,
}: {
  mode: "login" | "signup";
  /** Message recovered from the query string on the no-JS redirect path. */
  initialError?: string | null;
  action: (
    prev: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {
    error: null,
  });

  const isSignup = mode === "signup";
  // The action result wins once the form has been submitted in-page.
  const message = state.error ?? initialError;

  return (
    <div className="rise mx-auto w-full max-w-sm px-6 py-24">
      <h1 className="text-xl font-medium tracking-tight">DevTrack</h1>
      <p className="mt-1 text-sm text-muted">
        {isSignup ? "Create a local account." : "Sign in to your dashboard."}
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        <PendingOverlay
          label={isSignup ? "Creating your account…" : "Signing you in…"}
        />
        {isSignup && (
          <div>
            <label htmlFor="name" className={labelClass}>
              Name <span className="text-faint">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className={fieldClass}
              placeholder="Ada Lovelace"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={fieldClass}
            placeholder="you@devtrack.local"
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
            className={fieldClass}
            placeholder={isSignup ? "At least 8 characters" : "••••••••"}
          />
        </div>

        {message && (
          <p
            role="alert"
            className="rounded-md border border-line bg-accent-soft px-3 py-2 text-xs"
          >
            {message}
          </p>
        )}

        <SubmitButton label={isSignup ? "Create account" : "Sign in"} />
      </form>

      <p className="mt-6 text-xs text-muted">
        {isSignup ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="text-accent hover:underline"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
