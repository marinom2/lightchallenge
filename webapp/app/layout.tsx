// webapp/app/layout.tsx
import "./globals.css"
import Providers from "./providers"
import Navbar from "./components/Navbar"
import NetGuard from "@/lib/ui/NetGuard"
import { Toasts } from "@/lib/ui/toast"

export const metadata = { title: "LightChallenge" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preload Inter variable fonts */}
        <link
          rel="preload"
          href="/fonts/Inter/Inter-VariableFont_opsz,wght.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-[#0b0e1a] text-white font-[Inter var]">
        <Providers>
          <Navbar />
          <NetGuard />
          <Toasts />

          {/* use our fluid container */}
          <main className="container-narrow py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}