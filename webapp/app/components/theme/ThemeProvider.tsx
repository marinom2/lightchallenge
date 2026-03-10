"use client";

import * as React from "react";

type Theme = "light" | "dark";

const ThemeContext = React.createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycle: () => void;
} | null>(null);

function normalizeTheme(value: unknown, fallback: Theme): Theme {
  if (value === "light" || value === "dark") return value;
    return fallback;
}

export function ThemeProvider({
  children,
  storageKey = "lc-theme",
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  storageKey?: string;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);

  const apply = React.useCallback(
    (next: Theme) => {
      setThemeState(next);

      try {
        // Persist for client-side
        localStorage.setItem(storageKey, next);

        // Persist for SSR reads (Next cookies)
        document.cookie = `${storageKey}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      } catch {
        // ignore storage errors (private mode, etc.)
      }

      // Apply rendered theme
      document.documentElement.setAttribute("data-theme", next);
    },
    [storageKey]
  );

  // Hydrate from storage once on mount (and auto-migrate legacy values)
  React.useEffect(() => {
    let stored: string | null = null;

    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      // ignore
    }

    const next = normalizeTheme(stored, defaultTheme);
    apply(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = React.useMemo(() => {
    return {
      theme,
      setTheme: apply,
      cycle: () => apply(theme === "light" ? "dark" : "light"),
    };
  }, [theme, apply]);

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}