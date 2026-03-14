"use client";

/**
 * MobileDrawer — Full-screen mobile navigation overlay.
 *
 * Triggered by a hamburger button. Shows all nav items,
 * theme toggle slot, and wallet connect slot.
 */

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type MobileNavItem = {
  label: string;
  href: string;
  /** Optional group separator before this item. */
  group?: string;
};

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  items: MobileNavItem[];
  /** Slot for theme toggle, wallet button, etc. */
  footer?: React.ReactNode;
  className?: string;
};

export default function MobileDrawer({
  open,
  onClose,
  items,
  footer,
  className = "",
}: MobileDrawerProps) {
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  let lastGroup: string | undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 40,
        }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={`lc-mobile-drawer ${className}`}
        style={{
          position: "fixed",
          top: "var(--lc-navbar-h)",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          backgroundColor: "var(--lc-bg)",
          overflowY: "auto",
          padding: "var(--lc-space-4)",
        }}
      >
        {/* Close button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--lc-space-4)" }}>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              padding: "6px 12px",
              fontSize: "var(--lc-text-small)",
              color: "var(--lc-text-secondary)",
              backgroundColor: "transparent",
              border: "1px solid var(--lc-border)",
              borderRadius: "var(--lc-radius-sm)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {/* Nav items */}
        <nav aria-label="Mobile navigation">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
            {items.map((item) => {
              const active = isActive(item.href);
              const showGroup = item.group && item.group !== lastGroup;
              if (item.group) lastGroup = item.group;

              return (
                <React.Fragment key={item.href}>
                  {showGroup && (
                    <li
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "var(--lc-space-3) var(--lc-space-3) var(--lc-space-1)",
                        marginTop: "var(--lc-space-2)",
                      }}
                    >
                      {item.group}
                    </li>
                  )}
                  <li>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px var(--lc-space-3)",
                        fontSize: "var(--lc-text-body)",
                        fontWeight: active ? ("var(--lc-weight-medium)" as any) : ("var(--lc-weight-normal)" as any),
                        color: active ? "var(--lc-text)" : "var(--lc-text-secondary)",
                        backgroundColor: active ? "var(--lc-bg-overlay)" : "transparent",
                        borderRadius: "var(--lc-radius-md)",
                        textDecoration: "none",
                        transition: `background-color var(--lc-dur-fast) var(--lc-ease)`,
                      }}
                    >
                      {item.label}
                      {active && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: "var(--lc-accent)",
                          }}
                        />
                      )}
                    </Link>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </nav>

        {/* Footer slot */}
        {footer && (
          <div
            style={{
              marginTop: "var(--lc-space-6)",
              paddingTop: "var(--lc-space-4)",
              borderTop: "1px solid var(--lc-border)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
