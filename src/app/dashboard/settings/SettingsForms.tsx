"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changePassword,
  setLeaderboardVisibility,
  updateProfile,
  type SettingsState,
} from "./actions";

const EMPTY: SettingsState = { error: null, ok: null };

const fieldClass =
  "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus:border-accent";
const labelClass = "block text-xs font-medium text-muted";

function SaveButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="press rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/** One place for the result line, so every form reports the same way. */
function Result({ state }: { state: SettingsState }) {
  if (!state.error && !state.ok) return null;

  return (
    <p
      role="status"
      className={`fade mt-3 text-xs ${state.error ? "text-ink" : "text-accent"}`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rise rounded-lg border border-line bg-surface px-5 py-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted">
        {description}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateProfile, EMPTY);

  return (
    <Card
      title="Display name"
      description="Shown in the dashboard header and on the leaderboard. Leave it empty and the part of your email before the @ is used instead."
    >
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={name}
            maxLength={191}
            placeholder="Ada Lovelace"
            className={fieldClass}
          />
        </div>
        <SaveButton />
      </form>
      <Result state={state} />
    </Card>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, EMPTY);

  return (
    <Card
      title="Password"
      description="Changing it does not sign you out — the session is a signed cookie that does not carry your password."
    >
      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="current" className={labelClass}>
            Current
          </label>
          <input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="next" className={labelClass}>
            New
          </label>
          <input
            id="next"
            name="next"
            type="password"
            autoComplete="new-password"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="confirm" className={labelClass}>
            Confirm new
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-3">
          <SaveButton label="Change password" />
        </div>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function LeaderboardForm({ show }: { show: boolean }) {
  const [state, action] = useActionState(setLeaderboardVisibility, EMPTY);

  return (
    <Card
      title="Leaderboard"
      description="The leaderboard is the only place other accounts see anything about you: a display name, your totals, and which languages you write most. Never project names or file paths. Opt out and you are excluded entirely rather than anonymised."
    >
      <form action={action} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showOnLeaderboard"
            defaultChecked={show}
            className="accent-accent"
          />
          Include me on the leaderboard
        </label>
        <SaveButton />
      </form>
      <Result state={state} />
    </Card>
  );
}
