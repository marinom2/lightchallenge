"use client";

import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const ThemeContext = React.createContext<{
  theme: ResolvedTheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  cycle: () => void;
} | null>(null);

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  // system: check media query
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function normalizePreference(value: unknown): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function ThemeProvider({
  children,
  storageKey = "lc-theme",
}: {
  children: React.ReactNode;
  storageKey?: string;
}) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>("system");
  const [resolved, setResolved] = React.useState<ResolvedTheme>("light");

  const applyResolved = React.useCallback((theme: ResolvedTheme) => {
    setResolved(theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const setPref = React.useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      try {
        localStorage.setItem(storageKey, next);
        document.cookie = `${storageKey}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      } catch {
        // ignore storage errors
      }
      applyResolved(resolveTheme(next));
    },
    [storageKey, applyResolved]
  );

  // Hydrate from storage on mount
  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      // ignore
    }
    const pref = normalizePreference(stored);
    setPreferenceState(pref);
    applyResolved(resolveTheme(pref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for system theme changes when preference is "system"
  React.useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      applyResolved(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference, applyResolved]);

  const api = React.useMemo(() => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    return {
      theme: resolved,
      preference,
      setPreference: setPref,
      cycle: () => {
        const idx = order.indexOf(preference);
        setPref(order[(idx + 1) % order.length]);
      },
    };
  }, [resolved, preference, setPref]);

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
