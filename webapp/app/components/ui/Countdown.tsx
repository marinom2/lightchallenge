"use client";

/**
 * Countdown — Deadline urgency display.
 *
 * Shows time remaining with color-coded urgency:
 *   green  (>3 days)   "7d left"
 *   yellow (1-3 days)  "2d 4h left"
 *   red    (<24 hours) "5h 23m left"
 *   gray   (ended)     "Ended"
 *
 * Renders as a Badge with urgency variant.
 */

import React, { useEffect, useState } from "react";
import Badge from "./Badge";

type CountdownProps = {
  /** Deadline as ISO string or Date or unix timestamp (seconds). */
  deadline: string | Date | number;
  /** Optional label suffix (default: "left"). */
  suffix?: string;
  /** Size passthrough to Badge. */
  size?: "sm" | "md";
  className?: string;
};

function getUrgency(msRemaining: number): "safe" | "soon" | "imminent" | "ended" {
  if (msRemaining <= 0) return "ended";
  if (msRemaining < 24 * 60 * 60 * 1000) return "imminent";
  if (msRemaining < 3 * 24 * 60 * 60 * 1000) return "soon";
  return "safe";
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ended";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function parseDeadline(deadline: string | Date | number): number {
  if (typeof deadline === "number") {
    // If < 1e12, assume seconds; otherwise milliseconds
    return deadline < 1e12 ? deadline * 1000 : deadline;
  }
  return new Date(deadline).getTime();
}

export default function Countdown({
  deadline,
  suffix = "left",
  size = "sm",
  className,
}: CountdownProps) {
  const deadlineMs = parseDeadline(deadline);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) return;

    // Tick every minute if > 1 hour, every second if < 1 hour
    const interval = remaining > 60 * 60 * 1000 ? 60_000 : 1_000;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [deadlineMs]);

  const remaining = deadlineMs - now;
  const urgency = getUrgency(remaining);
  const label = remaining <= 0 ? "Ended" : `${formatRemaining(remaining)} ${suffix}`;

  return (
    <Badge variant="urgency" urgency={urgency} dot size={size} className={className}>
      {label}
    </Badge>
  );
}
