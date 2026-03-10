"use client";

import * as React from "react";
import { Info, AlertTriangle, XCircle } from "lucide-react";

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  title?: string;
  children: React.ReactNode;
}) {
  const meta =
    tone === "ok"
      ? { Icon: Info, border: "color-mix(in oklab, var(--accent) 55%, transparent)", bg: "color-mix(in oklab, var(--accent) 12%, transparent)" }
      :
    tone === "bad"
      ? { Icon: XCircle, border: "color-mix(in oklab, var(--error) 55%, transparent)", bg: "color-mix(in oklab, var(--error) 14%, transparent)" }
      : tone === "warn"
        ? { Icon: AlertTriangle, border: "color-mix(in oklab, var(--warn) 55%, transparent)", bg: "color-mix(in oklab, var(--warn) 14%, transparent)" }
        : { Icon: Info, border: "color-mix(in oklab, var(--text) 18%, transparent)", bg: "color-mix(in oklab, var(--surface-2) 70%, transparent)" };

  const Icon = meta.Icon;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        border: `1px solid ${meta.border}`,
        background: meta.bg,
        boxShadow: "var(--sh-1)",
      }}
    >
      <div className="flex items-start gap-2">
        <Icon size={16} style={{ color: "var(--text-muted)", marginTop: 2 }} />
        <div className="min-w-0">
          {title ? <div className="text-sm font-semibold">{title}</div> : null}
          <div className="text-sm text-(--text-muted)">{children}</div>
        </div>
      </div>
    </div>
  );
}