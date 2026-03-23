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
import AiChat from "./components/ui/AiChat";

export const metadata: Metadata = {
  title: "LightChallenge — Create & Verify Challenges",
  description:
    "LightChallenge — a decentralized app where you can create, join, and verify gaming or fitness challenges powered by LightChain.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#03040c" },
  ],
};

const STORAGE_KEY = "lc-theme";
type ResolvedTheme = "light" | "dark";

function initialThemeFromCookies(): ResolvedTheme {
  const raw = cookies().get(STORAGE_KEY)?.value;
  if (raw === "light") return "light";
  if (raw === "dark") return "dark";
  // "system" or no cookie → default to light (SSR can't read prefers-color-scheme;
  // the inline script below will correct on client before paint)
  return "light";
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = initialThemeFromCookies();

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var KEY = "${STORAGE_KEY}";
    var pref = localStorage.getItem(KEY) || "system";
    var v;
    if (pref === "light" || pref === "dark") {
      v = pref;
    } else {
      v = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", v);
  } catch (e) {}
})();`,
          }}
        />

        <Providers>
          <ThemeProvider storageKey={STORAGE_KEY}>
            <Navbar />

            <main
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: "calc(100dvh - var(--lc-navbar-h))",
              }}
            >
              <div style={{ flex: 1, paddingTop: "var(--lc-space-6)", paddingBottom: "var(--lc-space-8)" }}>
                <div className="container-narrow">{children}</div>
              </div>

              {/* Footer */}
              <footer
                style={{
                  borderTop: "1px solid var(--lc-border)",
                  padding: "var(--lc-space-8) 0",
                }}
              >
                <div className="container-narrow">
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "var(--lc-space-4)",
                    }}
                  >
                    {/* Footer links */}
                    <nav
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: "var(--lc-space-6)",
                      }}
                    >
                      <a href="/explore" className="link-soft" style={{ fontSize: "var(--lc-text-small)" }}>
                        Explore
                      </a>
                      <a href="/challenges/create" className="link-soft" style={{ fontSize: "var(--lc-text-small)" }}>
                        Create
                      </a>
                      <a href="/me/challenges" className="link-soft" style={{ fontSize: "var(--lc-text-small)" }}>
                        My Challenges
                      </a>
                      <a href="/claims" className="link-soft" style={{ fontSize: "var(--lc-text-small)" }}>
                        Claims
                      </a>
                      <a
                        href="https://uat.docs.lightchallenge.app"
                        target="_blank"
                        rel="noreferrer"
                        className="link-soft"
                        style={{ fontSize: "var(--lc-text-small)" }}
                      >
                        Docs
                      </a>
                    </nav>

                    {/* Copyright */}
                    <p
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                      }}
                    >
                      &copy; <YearNow /> LightChallenge &middot; Powered by Lightchain AI
                    </p>
                  </div>
                </div>
              </footer>
            </main>

            <Toasts />
            <AiChat />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
