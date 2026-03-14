"use client";

/**
 * WalletPill — Connected wallet display with dropdown menu.
 *
 * When connected: shows truncated address + optional balance.
 * Click opens a dropdown with user-specific links (My Challenges, Settings, etc.).
 *
 * When disconnected: shows a "Connect Wallet" button.
 *
 * Actual wallet connection logic is passed via props to stay
 * decoupled from wagmi/RainbowKit.
 */

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";

type WalletPillProps = {
  /** Whether a wallet is connected. */
  connected: boolean;
  /** Truncated display address (e.g. "0x1234...5678"). */
  displayAddress?: string;
  /** Balance string (e.g. "12.5 LCAI"). */
  balance?: string;
  /** Chain name (e.g. "Lightchain Testnet"). */
  chainName?: string;
  /** Called when user clicks "Connect Wallet". */
  onConnect?: () => void;
  /** Called when user clicks "Disconnect". */
  onDisconnect?: () => void;
  /** Called when user clicks the pill (when connected). Opens account modal, etc. */
  onAccountClick?: () => void;
  /** Whether the user is an admin. */
  isAdmin?: boolean;
  className?: string;
};

type DropdownItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  separator?: boolean;
};

export default function WalletPill({
  connected,
  displayAddress,
  balance,
  chainName,
  onConnect,
  onDisconnect,
  onAccountClick,
  isAdmin = false,
  className = "",
}: WalletPillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!connected) {
    return (
      <button
        onClick={onConnect}
        className={`lc-wallet-pill ${className}`}
        style={{
          padding: "6px 16px",
          fontSize: "var(--lc-text-small)",
          fontWeight: "var(--lc-weight-medium)" as any,
          color: "var(--lc-accent-text)",
          backgroundColor: "var(--lc-accent)",
          border: "none",
          borderRadius: "var(--lc-radius-pill)",
          cursor: "pointer",
          transition: `background-color var(--lc-dur-fast) var(--lc-ease)`,
        }}
      >
        Connect Wallet
      </button>
    );
  }

  const dropdownItems: DropdownItem[] = [
    { label: "My Challenges", href: "/me/challenges" },
    { label: "Achievements", href: "/me/achievements" },
    { label: "Claims", href: "/claims" },
    { label: "Linked Accounts", href: "/settings/linked-accounts" },
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
    { separator: true, label: "" },
    { label: "Disconnect", onClick: () => { onDisconnect?.(); setOpen(false); } },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }} className={className}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--lc-space-2)",
          padding: "5px 12px",
          fontSize: "var(--lc-text-small)",
          fontWeight: "var(--lc-weight-medium)" as any,
          color: "var(--lc-text)",
          backgroundColor: "var(--lc-bg-raised)",
          border: "1px solid var(--lc-border)",
          borderRadius: "var(--lc-radius-pill)",
          cursor: "pointer",
          transition: `border-color var(--lc-dur-fast) var(--lc-ease)`,
        }}
      >
        {/* Colored dot */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "var(--lc-success)",
            flexShrink: 0,
          }}
        />
        <span>{displayAddress}</span>
        {balance && (
          <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-caption)" }}>
            {balance}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 220,
            backgroundColor: "var(--lc-bg-raised)",
            border: "1px solid var(--lc-border)",
            borderRadius: "var(--lc-radius-md)",
            boxShadow: "var(--lc-shadow-md)",
            overflow: "hidden",
            zIndex: 60,
          }}
        >
          {/* Header info */}
          <div
            style={{
              padding: "var(--lc-space-3) var(--lc-space-4)",
              borderBottom: "1px solid var(--lc-border)",
            }}
          >
            <div style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-medium)" as any, color: "var(--lc-text)" }}>
              {displayAddress}
            </div>
            {chainName && (
              <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>
                {chainName}
              </div>
            )}
            {balance && (
              <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)", marginTop: 2 }}>
                Balance: {balance}
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ padding: "var(--lc-space-1) 0" }}>
            {dropdownItems.map((item, i) => {
              if (item.separator) {
                return (
                  <div
                    key={`sep-${i}`}
                    style={{
                      height: 1,
                      backgroundColor: "var(--lc-border)",
                      margin: "var(--lc-space-1) 0",
                    }}
                  />
                );
              }
              const style: React.CSSProperties = {
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px var(--lc-space-4)",
                fontSize: "var(--lc-text-small)",
                color: item.label === "Disconnect" ? "var(--lc-danger)" : "var(--lc-text-secondary)",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                textDecoration: "none",
                transition: `color var(--lc-dur-fast) var(--lc-ease)`,
              };

              if (item.href) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    style={style}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <button key={item.label} role="menuitem" style={style} onClick={item.onClick}>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
