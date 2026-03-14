"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

export default function ValidatorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showStack, setShowStack] = useState(false);

  useEffect(() => {
    console.error("[Validators] error boundary caught:", error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <div className="panel p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in oklab, var(--danger) 12%, transparent)" }}
          >
            <AlertTriangle className="size-5 text-(--danger)" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-(--text-muted)">
              The Submit Proof page encountered an error.
            </p>
          </div>
        </div>

        <div className="rounded-lg p-3 text-sm font-mono break-all" style={{
          background: "color-mix(in oklab, var(--danger) 6%, transparent)",
          border: "1px solid color-mix(in oklab, var(--danger) 20%, transparent)",
        }}>
          {error.message || "Unknown error"}
        </div>

        {error.stack && (
          <button
            onClick={() => setShowStack((s) => !s)}
            className="flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--text) transition-colors"
          >
            {showStack ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {showStack ? "Hide" : "Show"} stack trace
          </button>
        )}

        {showStack && error.stack && (
          <pre className="text-[11px] text-(--text-muted) overflow-auto max-h-48 p-3 rounded-lg bg-(--card)">
            {error.stack}
          </pre>
        )}

        {error.digest && (
          <div className="text-xs text-(--text-muted)">
            Digest: <code className="font-mono">{error.digest}</code>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button onClick={reset} className="btn btn-primary flex items-center gap-2">
            <RotateCcw className="size-4" /> Try again
          </button>
          <Link href="/explore" className="btn btn-ghost">
            Back to Explore
          </Link>
        </div>
      </div>
    </div>
  );
}
