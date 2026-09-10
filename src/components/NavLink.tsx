"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

/**
 * `useLinkStatus` reports the pending state of the Link it is rendered inside,
 * so the indicator has to be a child of the Link rather than a sibling.
 */
function PendingBar() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={`absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full ${
        pending ? "route-progress bg-line" : ""
      }`}
    />
  );
}

/**
 * Dashboard navigation link: marks the current section and shows real progress
 * while the next one loads.
 */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`press relative rounded-md px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-muted hover:text-ink"
      }`}
    >
      {children}
      <PendingBar />
    </Link>
  );
}
