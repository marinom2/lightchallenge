// app/layout.tsx
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import Providers from "./providers";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import Navbar from "./components/Navbar";
import { Toasts } from "@/lib/ui/toast";
import YearNow from "./year-now";

export const metadata: Metadata = {
  title: "LightChallenge — Create & Verify Challenges",
  description:
    "LightChallenge — a decentralized app where you can create, join, and verify gaming or fitness challenges powered by LightChain.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#050712" },
  ],
};

const STORAGE_KEY = "lc-theme";
type Theme = "light" | "dark";

function initialThemeFromCookies(): Theme {
  const raw = cookies().get(STORAGE_KEY)?.value;
  return raw === "light" ? "light" : "dark";
}

/**
 * Background system:
 * - Global hero lives in CSS only: body::before + body::after
 * - Disable per-page by setting html.no-app-hero (your existing flag)
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = initialThemeFromCookies();

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <body className="min-h-[100dvh] antialiased">
        {/* Resolve theme BEFORE paint; strict 2-theme policy */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var KEY = "${STORAGE_KEY}";
    var fallback = "${initialTheme}";
    var v = localStorage.getItem(KEY) || fallback;
    if (v !== "light" && v !== "dark") v = "dark";
    document.documentElement.setAttribute("data-theme", v);
  } catch (e) {}
})();`,
          }}
        />

        <Providers>
          <ThemeProvider storageKey={STORAGE_KEY} defaultTheme={initialTheme}>
            <Navbar />

            <main className="flex min-h-[100dvh] flex-col">
              <div className="flex-1 pt-[calc(var(--navbar-top)+env(safe-area-inset-top,0px))]">
                <div className="container-narrow py-8">{children}</div>
              </div>

              <footer className="ftr">
                <div className="container-narrow py-7 text-center text-sm text-(--text-muted)">
                  <div>
                    © <YearNow /> LightChallenge.
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2">
                    <a href="/" className="link-soft">
                      Home
                    </a>
                    <a href="/explore" className="link-soft">
                      Explore
                    </a>
                    <a href="/challenges/create" className="link-soft">
                      Create
                    </a>
                  </div>
                </div>
              </footer>
            </main>

            <Toasts />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}