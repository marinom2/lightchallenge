"use client";
import * as React from "react";

type Medal =
  | "Herald"
  | "Guardian"
  | "Crusader"
  | "Archon"
  | "Legend"
  | "Ancient"
  | "Divine"
  | "Immortal";

export function rankTierToMedal(rt?: number | null) {
  if (!rt || rt < 10) return null;
  const tier = Math.floor(rt / 10);
  const stars = rt % 10;
  const names: Record<number, Medal> = {
    1: "Herald",
    2: "Guardian",
    3: "Crusader",
    4: "Archon",
    5: "Legend",
    6: "Ancient",
    7: "Divine",
    8: "Immortal",
  };
  return { medal: names[tier] ?? ("Herald" as Medal), stars };
}

const palette: Record<Medal, { bg: string; fg: string; accent: string }> = {
  Herald:   { bg: "#3b3b3b", fg: "#c9c9c9", accent: "#7d7d7d" },
  Guardian: { bg: "#275b2e", fg: "#d1ffd8", accent: "#43a053" },
  Crusader: { bg: "#3a424f", fg: "#d6e9ff", accent: "#5d87b1" },
  Archon:   { bg: "#354464", fg: "#d9e6ff", accent: "#6c8ad8" },
  Legend:   { bg: "#574037", fg: "#ffe9d5", accent: "#b47852" },
  Ancient:  { bg: "#4b435f", fg: "#efe6ff", accent: "#9e85e1" },
  Divine:   { bg: "#2a4d6f", fg: "#d9f0ff", accent: "#5fb0ff" },
  Immortal: { bg: "#6b2b2e", fg: "#ffe8ed", accent: "#ff8aa0" },
};

export default function MedalIcon({
  medal,
  size = 20,
  className = "",
}: {
  medal: Medal;
  size?: number;
  className?: string;
}) {
  const c = palette[medal] ?? palette.Herald;
  // Simple roundel + star/crown; tiny, readable at 16–20px.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label={`${medal} medal`}
    >
      <defs>
        <radialGradient id={`g-${medal}`} cx="50%" cy="40%" r="70%">
          <stop offset="0%"   stopColor={c.fg} stopOpacity="0.25" />
          <stop offset="100%" stopColor={c.bg} />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#g-${medal})`} stroke={c.accent} strokeOpacity="0.6" />
      {medal === "Immortal" ? (
        // Crown
        <path
          d="M6 14l0-5 3 3 3-4 3 4 3-3 0 5z"
          fill={c.fg}
          fillOpacity="0.9"
        />
      ) : (
        // Star
        <path
          d="M12 6.3l1.7 3.5 3.9.57-2.8 2.7.66 3.9L12 14.9l-3.5 1.9.66-3.9-2.8-2.7 3.9-.57z"
          fill={c.fg}
          fillOpacity="0.9"
        />
      )}
    </svg>
  );
}