import { signOut } from "@/lib/auth";
import { PendingOverlay } from "@/components/PendingOverlay";

/**
 * A form rather than an onClick handler: sign-out is a POST, and this keeps it
 * working without client JavaScript. The overlay is a child of the form so it
 * can read that form's pending state.
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <PendingOverlay label="Signing you out…" />
      <button
        type="submit"
        className="press rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Sign out
      </button>
    </form>
  );
}
