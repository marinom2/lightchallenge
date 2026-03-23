"use client";

/**
 * Error boundary for /competitions/[id] pages.
 *
 * Catches runtime errors and shows a friendly recovery UI
 * using the design-system tokens.
 */

import { useEffect } from "react";

export default function CompetitionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Competition] error boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        maxWidth: "var(--lc-content-max-w)",
        margin: "0 auto",
        padding: "var(--lc-space-6)",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--lc-bg-raised)",
          border: "1px solid var(--lc-border)",
          borderRadius: "var(--lc-radius-lg)",
          padding: "var(--lc-space-8)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--lc-radius-md)",
            backgroundColor: "color-mix(in oklab, var(--lc-danger) 12%, transparent)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "var(--lc-space-4)",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--lc-danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: "var(--lc-text-heading)",
            fontWeight: "var(--lc-weight-bold)" as any,
            color: "var(--lc-text)",
            margin: "0 0 var(--lc-space-2)",
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-tertiary)",
            margin: "0 0 var(--lc-space-2)",
            maxWidth: 400,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          We ran into an unexpected error loading this competition.
        </p>

        {/* Error message */}
        <div
          style={{
            fontSize: "var(--lc-text-caption)",
            fontFamily: "var(--lc-font-mono)",
            color: "var(--lc-text-muted)",
            backgroundColor: "var(--lc-bg-inset)",
            border: "1px solid var(--lc-border)",
            borderRadius: "var(--lc-radius-sm)",
            padding: "var(--lc-space-3)",
            marginBottom: "var(--lc-space-6)",
            maxWidth: 400,
            marginLeft: "auto",
            marginRight: "auto",
            wordBreak: "break-word",
          }}
        >
          {error.message || "Unknown error"}
          {error.digest && (
            <span style={{ display: "block", marginTop: 4, opacity: 0.6 }}>
              Digest: {error.digest}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "var(--lc-space-3)",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: "var(--lc-radius-pill)",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              fontSize: "var(--lc-text-small)",
              border: "none",
              cursor: "pointer",
              transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
              minHeight: 44,
            }}
          >
            Try again
          </button>

          <a
            href="/competitions"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: "var(--lc-radius-pill)",
              backgroundColor: "transparent",
              color: "var(--lc-text-secondary)",
              fontWeight: "var(--lc-weight-medium)" as any,
              fontSize: "var(--lc-text-small)",
              border: "1px solid var(--lc-border)",
              textDecoration: "none",
              cursor: "pointer",
              transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
              minHeight: 44,
            }}
          >
            Back to Competitions
          </a>
        </div>
      </div>
    </div>
  );
}
