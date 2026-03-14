/**
 * webapp/app/embed/layout.tsx
 *
 * Minimal layout for the embeddable competition widget.
 * No navbar, no footer, no providers -- just a clean shell
 * suitable for rendering inside an iframe.
 *
 * Because this layout sits under /app/embed/ it overrides the root
 * layout for all /embed/* routes in Next.js App Router.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LightChallenge Widget",
  description: "Embeddable competition widget powered by LightChallenge",
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          background: "transparent",
          color: "#fafafa",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {children}
      </body>
    </html>
  );
}
