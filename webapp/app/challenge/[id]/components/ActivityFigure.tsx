"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Footprints,
  PersonStanding,
  Bike,
  Waves,
  Dumbbell,
  Mountain,
  Activity,
} from "lucide-react";

export type ActivityType =
  | "walking"
  | "running"
  | "cycling"
  | "swimming"
  | "strength"
  | "hiking"
  | "fallback";

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  walking: "#22C55E",
  running: "#2563EB",
  cycling: "#F97316",
  swimming: "#06B6D4",
  strength: "#EF4444",
  hiking: "#22C55E",
  fallback: "#64748B",
};

const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  walking: Footprints,
  running: PersonStanding,
  cycling: Bike,
  swimming: Waves,
  strength: Dumbbell,
  hiking: Mountain,
  fallback: Activity,
};

/** Detect activity type from challenge fields (mirrors iOS ActivityTheme logic). */
export function detectActivity(fields: {
  title?: string;
  description?: string;
  modelId?: string | null;
  game?: string | null;
  tags?: string[];
}): ActivityType {
  const parts = [
    fields.title ?? "",
    fields.description ?? "",
    fields.modelId ?? "",
    fields.game ?? "",
    ...(fields.tags ?? []),
  ];
  const all = parts.join(" ").toLowerCase();

  if (all.includes("swim") || all.includes("pool") || all.includes("lap") || all.includes("swimming")) return "swimming";
  if (all.includes("cycl") || all.includes("bike") || all.includes("ride") || all.includes("cycling")) return "cycling";
  if (all.includes("run") || all.includes("marathon") || all.includes("jog") || all.includes("sprint") || all.includes("5k") || all.includes("treadmill")) return "running";
  if (all.includes("strength") || all.includes("lift") || all.includes("weight") || all.includes("gym") || all.includes("push")) return "strength";
  if (all.includes("hik") || all.includes("trail") || all.includes("climb")) return "hiking";

  return "walking";
}

export function ActivityFigure({
  activity,
  size = 120,
  isActive = true,
}: {
  activity: ActivityType;
  size?: number;
  isActive?: boolean;
}) {
  const color = ACTIVITY_COLORS[activity];
  const Icon = ACTIVITY_ICONS[activity];
  const iconSize = Math.round(size * 0.5);

  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `${color}18`,
        opacity: isActive ? 1 : 0.6,
      }}
    >
      <Icon size={iconSize} color={color} strokeWidth={1.5} />
    </div>
  );
}
