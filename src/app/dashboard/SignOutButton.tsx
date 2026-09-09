import { signOut } from "@/lib/auth";

// A form rather than an onClick handler: sign-out is a POST, and this keeps the
// whole thing a server component with no client JS.
export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Sign out
      </button>
    </form>
  );
}
