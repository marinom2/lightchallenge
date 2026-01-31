"use client";
import * as React from "react";

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-3 space-y-1">
      <div className="text-xs font-semibold text-(--text-muted)">{label}</div>
      {children}
      {error ? <div className="text-xs text-red-300">{error}</div> : null}
      {hint ? <div className="text-xs text-(--text-muted)">{hint}</div> : null}
    </div>
  );
}