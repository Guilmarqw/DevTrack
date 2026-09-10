import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/components/SignOutButton";
import type { SessionUser } from "@/lib/session";

const SECTIONS = [
  { href: "/dashboard", label: "Projects" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/settings", label: "Settings" },
];

/**
 * One header for every signed-in page, so the nav, theme control and sign-out
 * do not drift between them.
 */
export function DashboardHeader({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              DevTrack
            </Link>
            <span className="text-xs text-faint">
              {user.name ?? user.email}
              <span className="text-faint"> · </span>
              <span className="uppercase tracking-wide">{user.role}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>

        <nav className="-mx-2.5 flex items-center gap-1 overflow-x-auto pb-2">
          {SECTIONS.map((section) => (
            <NavLink key={section.href} href={section.href}>
              {section.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
