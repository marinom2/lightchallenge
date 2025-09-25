import "./globals.css"
import Navbar from "./components/Navbar"
import Footer from "./components/Footer"
import Providers from "./providers"
import { Inter } from "next/font/google"

export const metadata = { title: "LightChallenge" }
const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-[--lc-bg] text-white">
        <Providers>
          <Navbar />
          <main className="container-narrow px-4 py-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}