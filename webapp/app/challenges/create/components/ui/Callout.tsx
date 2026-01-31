"use client";
import * as React from "react";

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "bad";
  title?: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "bad" ? "callout callout-bad" : tone === "warn" ? "callout callout-warn" : "callout callout-info";

  return (
    <div className={cls}>
      {title ? <div className="font-semibold text-sm mb-1">{title}</div> : null}
      <div className="text-sm text-(--text-muted)">{children}</div>
    </div>
  );
}