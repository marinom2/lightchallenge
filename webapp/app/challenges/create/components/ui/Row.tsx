"use client";
import * as React from "react";
import { ChevronRight } from "lucide-react";

export function Row({
  icon,
  title,
  subtitle,
  status,
  onClick,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status?: "ok" | "warn" | "bad";
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  const pill =
    status === "ok" ? "pill-status" : status === "warn" ? "pill-status pill-warn" : "pill-status pill-bad";

  const El: any = onClick ? "button" : "div";
  return (
    <El type={onClick ? "button" : undefined} className="ess-row" onClick={onClick}>
      <div className="ess-row__left">
        <div className="ess-row__icon">{icon}</div>
        <div className="ess-row__text">
          <div className="ess-row__title">{title}</div>
          <div className="ess-row__sub" title={subtitle}>
            {subtitle}
          </div>
        </div>
      </div>

      <div className="ess-row__right">
        {right}
        {status ? <span className={pill}>{status.toUpperCase()}</span> : null}
        {onClick ? (
          <span className="ess-row__chev" aria-hidden="true">
            <ChevronRight size={18} />
          </span>
        ) : null}
      </div>
    </El>
  );
}