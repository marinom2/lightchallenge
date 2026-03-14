"use client";

/**
 * NavBar (v2) — Flat 5-item top navigation using lc-* design tokens.
 *
 * Design blueprint: 5 visible nav items (no "More" dropdown).
 *   Explore | Create | My Challenges | Claims | Achievements
 *
 * Right side: NetworkStatus, ThemeToggle, WalletPill/ConnectButton
 *
 * This component provides the structural shell. Actual wallet integration
 * is passed in as render props to stay decoupled from wagmi/RainbowKit.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  label: string;
  href: string;
};

type NavBarProps = {
  /** Nav items to show. Default: the 5 blueprint items. */
  items?: NavItem[];
  /** Right-side slot (wallet button, theme toggle, network status). */
  rightSlot?: React.ReactNode;
  /** Mobile drawer trigger — rendered on small screens. */
  mobileMenuSlot?: React.ReactNode;
  /** Logo element override. */
  logo?: React.ReactNode;
  className?: string;
};

const DEFAULT_NAV: NavItem[] = [
  { label: "Explore", href: "/explore" },
  { label: "Create", href: "/challenges/create" },
  { label: "My Challenges", href: "/me/challenges" },
  { label: "Claims", href: "/claims" },
  { label: "Achievements", href: "/me/achievements" },
];

export default function NavBar({
  items = DEFAULT_NAV,
  rightSlot,
  mobileMenuSlot,
  logo,
  className = "",
}: NavBarProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });

  const isActive = useCallback(
    (href: string) => pathname === href || (pathname?.startsWith(href + "/") ?? false),
    [pathname]
  );

  // Update underline indicator position
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeLink = nav.querySelector("[data-active='true']") as HTMLElement;
    if (!activeLink) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    setIndicator({
      left: linkRect.left - navRect.left,
      width: linkRect.width,
      visible: true,
    });
  }, [pathname]);

  return (
    <header
      className={`lc-navbar ${className}`}
      role="banner"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "var(--lc-navbar-h)",
        display: "flex",
        alignItems: "center",
        backgroundColor: "var(--lc-bg)",
        borderBottom: "1px solid var(--lc-border)",
        padding: "0 var(--lc-space-6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          maxWidth: "var(--lc-content-max-w)",
          margin: "0 auto",
          gap: "var(--lc-space-6)",
        }}
      >
        {/* Logo */}
        {logo || (
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--lc-accent)",
              }}
            />
            <span
              style={{
                fontSize: "var(--lc-text-body)",
                fontWeight: "var(--lc-weight-semibold)" as any,
                color: "var(--lc-text)",
                letterSpacing: "var(--lc-tracking-tight)",
              }}
            >
              LightChallenge
            </span>
          </Link>
        )}

        {/* Desktop nav */}
        <nav
          ref={navRef}
          aria-label="Primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--lc-space-1)",
            position: "relative",
            flex: 1,
            minWidth: 0,
          }}
          className="lc-navbar__nav"
        >
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
                style={{
                  padding: "6px 12px",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: active ? ("var(--lc-weight-medium)" as any) : ("var(--lc-weight-normal)" as any),
                  color: active ? "var(--lc-text)" : "var(--lc-text-secondary)",
                  textDecoration: "none",
                  borderRadius: "var(--lc-radius-sm)",
                  whiteSpace: "nowrap",
                  transition: `color var(--lc-dur-fast) var(--lc-ease)`,
                  flexShrink: 0,
                }}
              >
                {item.label}
              </Link>
            );
          })}
          {/* Active indicator */}
          <span
            style={{
              position: "absolute",
              bottom: -1,
              left: indicator.left,
              width: indicator.width,
              height: 2,
              backgroundColor: "var(--lc-select-text)",
              borderRadius: 1,
              opacity: indicator.visible ? 1 : 0,
              transition: `left var(--lc-dur-base) var(--lc-ease), width var(--lc-dur-base) var(--lc-ease), opacity var(--lc-dur-fast) var(--lc-ease)`,
            }}
          />
        </nav>

        {/* Right slot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--lc-space-3)",
            flexShrink: 0,
          }}
          className="lc-navbar__right"
        >
          {rightSlot}
        </div>

        {/* Mobile menu trigger — hidden on desktop via CSS */}
        {mobileMenuSlot && (
          <div className="lc-navbar__mobile-trigger">{mobileMenuSlot}</div>
        )}
      </div>
    </header>
  );
}
