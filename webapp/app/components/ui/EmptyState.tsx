"use client";

/**
 * EmptyState — Guidance when a list or view has no content.
 *
 * Shows an icon, headline, description, and optional CTA button.
 * Used for: empty explore results, no challenges, no achievements, etc.
 */

import React from "react";

type EmptyStateProps = {
  /** Optional icon element (e.g. Lucide icon or emoji). */
  icon?: React.ReactNode;
  /** Short headline (e.g. "No challenges yet"). */
  title: string;
  /** Supporting description with guidance. */
  description?: string;
  /** CTA button label. */
  actionLabel?: string;
  /** CTA click handler or href. */
  onAction?: () => void;
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`lc-empty-state ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--lc-space-3)",
        padding: "var(--lc-space-12) var(--lc-space-6)",
        textAlign: "center",
      }}
    >
      {icon && (
        <span
          style={{
            fontSize: "2.5rem",
            color: "var(--lc-text-muted)",
            lineHeight: 1,
          }}
        >
          {icon}
        </span>
      )}
      <h3
        style={{
          fontSize: "var(--lc-text-subhead)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: "var(--lc-text)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-secondary)",
            maxWidth: 360,
            margin: 0,
            lineHeight: "var(--lc-leading-normal)" as any,
          }}
        >
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: "var(--lc-space-2)",
            padding: "10px 20px",
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-medium)" as any,
            color: "var(--lc-accent-text)",
            backgroundColor: "var(--lc-accent)",
            border: "none",
            borderRadius: "var(--lc-radius-md)",
            cursor: "pointer",
            transition: `background-color var(--lc-dur-fast) var(--lc-ease)`,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
