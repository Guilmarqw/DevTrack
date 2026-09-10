"use client";

import { useFormStatus } from "react-dom";
import { BootMark } from "./BootMark";

/**
 * Full-screen overlay shown while the form it lives in is submitting.
 *
 * Sign-in, sign-up and sign-out all end in a redirect, so the moment between
 * the click and the new page is dead time the user would otherwise stare at.
 * `useFormStatus` only reports the form this is rendered inside, so it must be
 * a child of that <form>.
 */
export function PendingOverlay({ label }: { label: string }) {
  const { pending } = useFormStatus();

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fade fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-canvas/95 backdrop-blur-sm"
    >
      <BootMark />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
