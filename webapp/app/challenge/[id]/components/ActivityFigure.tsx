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
  Flame,
  Heart,
  Timer,
  Rows3,
} from "lucide-react";

// Aligned with iOS ActivityTheme — same types, colors, and detection logic.
export type ActivityType =
  | "walking"
  | "running"
  | "cycling"
  | "swimming"
  | "strength"
  | "hiking"
  | "yoga"
  | "crossfit"
  | "rowing"
  | "calories"
  | "exercise"
  | "fallback";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
  swimming: "Swimming",
  strength: "Strength",
  hiking: "Hiking",
  yoga: "Yoga",
  crossfit: "CrossFit / HIIT",
  rowing: "Rowing",
  calories: "Calories",
  exercise: "Exercise",
  fallback: "Fitness",
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  walking: "#22C55E",
  running: "#3B82F6",
  cycling: "#F97316",
  swimming: "#06B6D4",
  strength: "#EF4444",
  hiking: "#8B5CF6",
  yoga: "#A855F7",
  crossfit: "#F43F5E",
  rowing: "#0EA5E9",
  calories: "#F59E0B",
  exercise: "#10B981",
  fallback: "#64748B",
};

const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  walking: Footprints,
  running: PersonStanding,
  cycling: Bike,
  swimming: Waves,
  strength: Dumbbell,
  hiking: Mountain,
  yoga: Activity,
  crossfit: Timer,
  rowing: Rows3,
  calories: Flame,
  exercise: Heart,
  fallback: Activity,
};

/** Detect activity type from challenge fields — mirrors iOS ActivityTheme.from(detail:). */
export function detectActivity(fields: {
  title?: string;
  description?: string;
  modelId?: string | null;
  game?: string | null;
  tags?: string[];
  metric?: string | null;
}): ActivityType {
  // 1. Check metric field first (most reliable, same as iOS)
  const metric = (fields.metric ?? "").toLowerCase();
  if (metric === "swimming_km") return "swimming";
  if (metric === "cycling_km") return "cycling";
  if (metric === "distance" || metric === "distance_km") return "running";
  if (metric === "walking_km") return "walking";
  if (metric === "strength_sessions") return "strength";
  if (metric === "hiking_km") return "hiking";
  if (metric === "yoga_min") return "yoga";
  if (metric === "hiit_min" || metric === "crossfit_min") return "crossfit";
  if (metric === "rowing_km") return "rowing";
  if (metric === "exercise_time") return "exercise";
  if (metric === "calories") return "calories";
  if (metric === "steps") return "walking";

  // 2. Check modelId (e.g. "apple_health.steps@1")
  const modelId = (fields.modelId ?? "").toLowerCase();
  if (modelId.includes("swimming")) return "swimming";
  if (modelId.includes("cycling")) return "cycling";
  if (modelId.includes("distance")) return "running";
  if (modelId.includes("strength")) return "strength";
  if (modelId.includes("hiking")) return "hiking";
  if (modelId.includes("yoga")) return "yoga";
  if (modelId.includes("hiit") || modelId.includes("crossfit")) return "crossfit";
  if (modelId.includes("rowing")) return "rowing";
  if (modelId.includes("calories")) return "calories";
  if (modelId.includes("exercise")) return "exercise";
  if (modelId.includes("walking")) return "walking";
  if (modelId.includes("steps")) return "walking";

  // 3. Check tags
  const tags = (fields.tags ?? []).join(" ").toLowerCase();
  if (tags.includes("swimming")) return "swimming";
  if (tags.includes("cycling")) return "cycling";
  if (tags.includes("running")) return "running";
  if (tags.includes("strength")) return "strength";
  if (tags.includes("hiking")) return "hiking";
  if (tags.includes("yoga")) return "yoga";
  if (tags.includes("hiit") || tags.includes("crossfit")) return "crossfit";
  if (tags.includes("rowing")) return "rowing";
  if (tags.includes("calories")) return "calories";
  if (tags.includes("walking")) return "walking";

  // 4. Text search on title + description (same keywords as iOS)
  const text = [fields.title ?? "", fields.description ?? ""].join(" ").toLowerCase();
  if (text.includes("swim") || text.includes("pool")) return "swimming";
  if (text.includes("cycl") || text.includes("bike") || text.includes("ride")) return "cycling";
  if (text.includes("run") || text.includes("marathon") || text.includes("jog")) return "running";
  if (text.includes("strength") || text.includes("lift") || text.includes("weight")) return "strength";
  if (text.includes("hik") || text.includes("trail") || text.includes("climb")) return "hiking";
  if (text.includes("yoga") || text.includes("meditat")) return "yoga";
  if (text.includes("hiit") || text.includes("crossfit") || text.includes("interval")) return "crossfit";
  if (text.includes("row") || text.includes("ergometer")) return "rowing";
  if (text.includes("calori") || text.includes("burn")) return "calories";

  return "walking";
}

export function getActivityColor(activity: ActivityType): string {
  return ACTIVITY_COLORS[activity];
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
