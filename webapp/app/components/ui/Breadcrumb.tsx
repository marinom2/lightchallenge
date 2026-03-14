"use client";

/**
 * Breadcrumb — Navigation trail for deep pages.
 *
 * Usage:
 *   <Breadcrumb items={[
 *     { label: "Explore", href: "/explore" },
 *     { label: "Challenge #42" },
 *   ]} />
 */

import React from "react";
import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  /** If provided, the item is a link. Last item is typically plain text. */
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export default function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`lc-breadcrumb ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--lc-space-2)",
        fontSize: "var(--lc-text-small)",
        color: "var(--lc-text-muted)",
      }}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span aria-hidden style={{ opacity: 0.4 }}>
                /
              </span>
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                style={{
                  color: "var(--lc-text-secondary)",
                  textDecoration: "none",
                  transition: `color var(--lc-dur-fast) var(--lc-ease)`,
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? "var(--lc-text)" : "var(--lc-text-secondary)" }}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
