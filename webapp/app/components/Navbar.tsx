"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

// Client-only ConnectButton
const ConnectButton = dynamic(() => import("./ConnectButton"), { ssr: false })

type NavItem = { label: string; href: string }

const NAV: NavItem[] = [
  { label: "Dashboard",    href: "/dashboard" },
  { label: "Explore",      href: "/explore" },
  { label: "Create",       href: "/challenges/create" },
  { label: "Claims",       href: "/claims" },
  { label: "Submit Proof", href: "/proofs/submit" },
]

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Lock body scroll while mobile sheet is open
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    html.style.overflow = open ? "hidden" : ""
    body.style.overflow = open ? "hidden" : ""
    return () => { html.style.overflow = ""; body.style.overflow = "" }
  }, [open])

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/")

  const Pill = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href)
    return (
      <Link
        href={item.href}
        className={`nav-pill ${active ? "is-active" : ""}`}
        onClick={() => setOpen(false)}
      >
        {item.label}
      </Link>
    )
  }

  const desktopNav = useMemo(
    () => (
      <nav className="nav-group items-center gap-2">
        {NAV.map((item) => <Pill key={item.href} item={item} />)}
      </nav>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname]
  )

  return (
    <div className="hdr relative">
      <div className="container-narrow mx-auto flex items-center gap-4 px-4 navbar">
        {/* Brand */}
        <Link href="/" className="flex items-center">
          <span className="navbar-brand h-gradient">LightChallenge</span>
        </Link>

        {/* Desktop nav */}
        <div className="ml-4 flex-1">{desktopNav}</div>

        {/* Right side (desktop) – ONLY the wallet */}
        <div className="hidden sm:flex items-center gap-2">
          <ConnectButton />
        </div>

        {/* Hamburger (mobile only) */}
        <button
          type="button"
          className="inline-flex items-center justify-center ml-auto nav-ghost md:hidden hide-desktop"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {!open ? (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path fill="currentColor" d="M18.3 5.7L12 12l-6.3-6.3L4.3 7.1 10.6 13.4 4.3 19.7 5.7 21.1 12 14.8l6.3 6.3 1.4-1.4L13.4 13.4 19.7 7.1z"/>
            </svg>
          )}
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden fixed inset-x-0 top-[64px] z-40">
          <div className="mobile-sheet mx-3 rounded-2xl shadow-xl overflow-hidden" role="dialog" aria-modal="true">
            <div className="p-2 flex flex-col gap-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-pill ${isActive(item.href) ? "is-active" : ""} w-full justify-center`}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center justify-end">
                <ConnectButton />
              </div>
            </div>
          </div>

          {/* Backdrop */}
          <button
            aria-label="Close menu"
            className="fixed inset-0 -z-10 bg-black/60"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}