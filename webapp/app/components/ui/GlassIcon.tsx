"use client";
import * as React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * GlassIcon — animated, theme-aware Lucide icon
 * Automatically adapts to global CSS variables (--grad-1, --grad-2, etc.)
 */
export function GlassIcon({
  icon: Icon,
  size = 22,
  tone = "auto",
  anim = "none",
  ring = true,
  className = "",
}: {
  icon: LucideIcon;
  size?: number;
  tone?: "auto" | "brand" | "cyan" | "magenta" | "amber" | "emerald" | "gray" | "danger";
  anim?: "none" | "pulse" | "float" | "spin" | "spin-slow";
  ring?: boolean;
  className?: string;
}) {
  const classes = [
    "glass-icon",
    tone !== "auto" ? `gi--${tone}` : "gi--brand",
    anim !== "none" ? `gi--${anim}` : "",
    ring ? "gi--ring" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span
      className={classes}
      style={{ ["--gi-size" as any]: `${size}px` }}
      aria-hidden="true"
    >
      <Icon className="gi__svg" />
    </span>
  );
}