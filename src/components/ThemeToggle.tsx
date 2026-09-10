"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "devtrack-theme";
const CHANGE_EVENT = "devtrack-theme-change";

/**
 * The theme is external state — it lives on <html data-theme> and in
 * localStorage, both set by a script before React runs. So it is read with
 * useSyncExternalStore rather than copied into state inside an effect: that
 * keeps the server and first client render in agreement, and means every
 * toggle instance on a page stays in sync without prop drilling.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab changing the preference should move this one too.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  const stamped = document.documentElement.dataset.theme;
  return stamped === "light" || stamped === "dark" ? stamped : "system";
}

/** Server render has no DOM, and "system" is the documented default. */
function getServerSnapshot(): Theme {
  return "system";
}

function apply(theme: Theme) {
  const root = document.documentElement;

  if (theme === "system") {
    // Removing the attribute is what hands control back to the OS setting.
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }

  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Blocked storage still gets the change for this page view.
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const OPTIONS: Array<{ value: Theme; label: string; hint: string }> = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "system", label: "Auto", hint: "Follow the system setting" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

/**
 * Three states rather than a two-way switch: "auto" is a genuinely different
 * answer from picking a side, and a binary toggle silently overrides the
 * operating system preference the first time it is touched.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => apply(option.value)}
            className={`press rounded-full px-2.5 py-1 text-xs ${
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
