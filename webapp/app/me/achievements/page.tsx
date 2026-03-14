"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import Badge from "@/app/components/ui/Badge";
import EmptyState from "@/app/components/ui/EmptyState";
import Skeleton from "@/app/components/ui/Skeleton";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import ConnectWalletGate from "@/app/components/ui/ConnectWalletGate";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Achievement = {
  token_id: string;
  challenge_id: string;
  recipient: string;
  achievement_type: string;
  tx_hash: string | null;
  minted_at: string;
  title: string | null;
  description: string | null;
};

type Reputation = {
  points: number;
  level: number;
  levelName: string;
  completions: number;
  victories: number;
};

/* ── Achievement type config ───────────────────────────────────────────────── */

type AchievementMeta = {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  points: number;
  description: string;
};

const ACHIEVEMENT_TYPES: Record<string, AchievementMeta> = {
  completion: {
    label: "Completion",
    icon: "\u2713",
    color: "var(--lc-accent)",
    bgColor: "var(--lc-accent-muted)",
    points: 50,
    description: "Challenge completed successfully",
  },
  victory: {
    label: "Victory",
    icon: "\u2605",
    color: "var(--lc-success)",
    bgColor: "var(--lc-success-muted)",
    points: 150,
    description: "Won the challenge outright",
  },
  streak: {
    label: "Win Streak",
    icon: "\uD83D\uDD25",
    color: "#f97316",
    bgColor: "rgba(249, 115, 22, 0.12)",
    points: 100,
    description: "Won multiple challenges in a row",
  },
  first_win: {
    label: "First Win",
    icon: "\uD83C\uDF1F",
    color: "#eab308",
    bgColor: "rgba(234, 179, 8, 0.12)",
    points: 75,
    description: "First ever challenge victory",
  },
  participation: {
    label: "Participation",
    icon: "\uD83D\uDC4F",
    color: "#8b5cf6",
    bgColor: "rgba(139, 92, 246, 0.12)",
    points: 25,
    description: "Participated in a challenge",
  },
  top_scorer: {
    label: "Top Scorer",
    icon: "\uD83C\uDFC6",
    color: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.12)",
    points: 200,
    description: "Achieved the highest score",
  },
  undefeated: {
    label: "Undefeated",
    icon: "\uD83D\uDEE1\uFE0F",
    color: "#06b6d4",
    bgColor: "rgba(6, 182, 212, 0.12)",
    points: 250,
    description: "Never lost during a tournament",
  },
  comeback: {
    label: "Comeback",
    icon: "\u26A1",
    color: "#ec4899",
    bgColor: "rgba(236, 72, 153, 0.12)",
    points: 125,
    description: "Won after being behind",
  },
  speedrun: {
    label: "Speedrun",
    icon: "\u23F1\uFE0F",
    color: "#14b8a6",
    bgColor: "rgba(20, 184, 166, 0.12)",
    points: 150,
    description: "Fastest challenge completion",
  },
  social: {
    label: "Social",
    icon: "\uD83E\uDD1D",
    color: "#6366f1",
    bgColor: "rgba(99, 102, 241, 0.12)",
    points: 50,
    description: "Community engagement milestone",
  },
  early_adopter: {
    label: "Early Adopter",
    icon: "\uD83D\uDE80",
    color: "#a855f7",
    bgColor: "rgba(168, 85, 247, 0.12)",
    points: 100,
    description: "Among the first to join the platform",
  },
  veteran: {
    label: "Veteran",
    icon: "\uD83C\uDF96\uFE0F",
    color: "#64748b",
    bgColor: "rgba(100, 116, 139, 0.12)",
    points: 200,
    description: "Completed 50+ challenges",
  },
  perfectionist: {
    label: "Perfectionist",
    icon: "\uD83D\uDCAF",
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.12)",
    points: 300,
    description: "100% completion rate",
  },
  explorer: {
    label: "Explorer",
    icon: "\uD83C\uDF0D",
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.12)",
    points: 75,
    description: "Tried challenges in every category",
  },
};

function getMeta(type: string): AchievementMeta {
  return (
    ACHIEVEMENT_TYPES[type] || {
      label: type,
      icon: "\u2726",
      color: "var(--lc-text-secondary)",
      bgColor: "var(--lc-bg-subtle)",
      points: 0,
      description: "Achievement unlocked",
    }
  );
}

/* ── Level config ──────────────────────────────────────────────────────────── */

const LEVEL_THRESHOLDS = [
  { min: 0, max: 100, level: 1, name: "Newcomer", color: "#94a3b8" },
  { min: 100, max: 300, level: 2, name: "Challenger", color: "#22c55e" },
  { min: 300, max: 800, level: 3, name: "Competitor", color: "#3b82f6" },
  { min: 800, max: 2000, level: 4, name: "Champion", color: "#f59e0b" },
  { min: 2000, max: Infinity, level: 5, name: "Legend", color: "#ef4444" },
];

function getLevelInfo(points: number) {
  const t = LEVEL_THRESHOLDS.find((t) => points >= t.min && points < t.max) || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const pct = t.max === Infinity ? 100 : Math.round(((points - t.min) / (t.max - t.min)) * 100);
  return { ...t, pct, nextThreshold: t.max === Infinity ? null : t.max };
}

/* ── Stat card component ───────────────────────────────────────────────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      padding: "var(--lc-space-4)",
      borderRadius: "var(--lc-radius-lg)",
      border: "1px solid var(--lc-border)",
      backgroundColor: "var(--lc-bg-raised)",
      textAlign: "center",
      flex: "1 1 0",
      minWidth: 100,
    }}>
      <div style={{ fontSize: "var(--lc-text-heading)", fontWeight: 700, color: color || "var(--lc-text)" }}>{value}</div>
      <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── Type breakdown mini-chart ─────────────────────────────────────────────── */

function TypeBreakdown({ achievements }: { achievements: Achievement[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of achievements) c[a.achievement_type] = (c[a.achievement_type] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [achievements]);

  if (counts.length === 0) return null;

  const max = counts[0][1];

  return (
    <div style={{
      padding: "var(--lc-space-5)",
      borderRadius: "var(--lc-radius-lg)",
      border: "1px solid var(--lc-border)",
      backgroundColor: "var(--lc-bg-raised)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--lc-space-3)",
    }}>
      <div style={{ fontSize: "var(--lc-text-small)", fontWeight: 600, color: "var(--lc-text)" }}>
        Achievement Breakdown
      </div>
      {counts.map(([type, count]) => {
        const meta = getMeta(type);
        return (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)" }}>
            <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{meta.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>{meta.label}</span>
                <span style={{ fontSize: "var(--lc-text-caption)", fontWeight: 600, color: "var(--lc-text)" }}>{count}</span>
              </div>
              <div style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "var(--lc-bg-subtle)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${(count / max) * 100}%`,
                  backgroundColor: meta.color,
                  borderRadius: 3,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Milestone tracker ─────────────────────────────────────────────────────── */

function MilestoneTracker({ achievements, reputation }: { achievements: Achievement[]; reputation: Reputation | null }) {
  const milestones = useMemo(() => {
    const total = achievements.length;
    const victories = achievements.filter((a) => a.achievement_type === "victory").length;
    const types = new Set(achievements.map((a) => a.achievement_type)).size;

    return [
      { label: "First Achievement", target: 1, current: total, icon: "\uD83C\uDF1F" },
      { label: "5 Achievements", target: 5, current: total, icon: "\u2B50" },
      { label: "10 Achievements", target: 10, current: total, icon: "\uD83C\uDFC5" },
      { label: "25 Achievements", target: 25, current: total, icon: "\uD83D\uDC8E" },
      { label: "First Victory", target: 1, current: victories, icon: "\uD83C\uDFC6" },
      { label: "5 Victories", target: 5, current: victories, icon: "\u2694\uFE0F" },
      { label: "3 Types Unlocked", target: 3, current: types, icon: "\uD83C\uDF08" },
      { label: "Reach Level 3", target: 3, current: reputation?.level ?? 1, icon: "\uD83D\uDD1D" },
      { label: "Reach Level 5", target: 5, current: reputation?.level ?? 1, icon: "\uD83D\uDC51" },
    ];
  }, [achievements, reputation]);

  return (
    <div style={{
      padding: "var(--lc-space-5)",
      borderRadius: "var(--lc-radius-lg)",
      border: "1px solid var(--lc-border)",
      backgroundColor: "var(--lc-bg-raised)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--lc-space-3)",
    }}>
      <div style={{ fontSize: "var(--lc-text-small)", fontWeight: 600, color: "var(--lc-text)" }}>
        Milestones
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "var(--lc-space-2)",
      }}>
        {milestones.map((m) => {
          const done = m.current >= m.target;
          const pct = Math.min(100, Math.round((m.current / m.target) * 100));
          return (
            <div key={m.label} style={{
              padding: "var(--lc-space-3)",
              borderRadius: "var(--lc-radius-md)",
              border: `1px solid ${done ? "var(--lc-success)" : "var(--lc-border)"}`,
              backgroundColor: done ? "var(--lc-success-muted)" : "transparent",
              display: "flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              opacity: done ? 1 : 0.7,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{m.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: 500,
                  color: done ? "var(--lc-success)" : "var(--lc-text-secondary)",
                }}>
                  {m.label}
                </div>
                {!done && (
                  <div style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: "var(--lc-bg-subtle)",
                    marginTop: 4,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      backgroundColor: "var(--lc-accent)",
                      borderRadius: 2,
                    }} />
                  </div>
                )}
              </div>
              {done && <span style={{ color: "var(--lc-success)", fontSize: 14 }}>{"\u2713"}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Filter tabs ───────────────────────────────────────────────────────────── */

const ALL_FILTERS = [
  "all", "completion", "victory", "streak", "first_win", "participation",
  "top_scorer", "speedrun", "early_adopter",
] as const;
type FilterKey = (typeof ALL_FILTERS)[number];

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function AchievementsPage() {
  const { address } = useAccount();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`/api/me/achievements?address=${address}`).then((r) => r.json()),
      fetch(`/api/me/reputation?address=${address}`).then((r) => r.json()),
    ])
      .then(([achData, repData]) => {
        setAchievements(achData.achievements || []);
        setReputation(repData);
      })
      .finally(() => setLoading(false));
  }, [address]);

  // Only show filters that have at least 1 achievement (plus "all")
  const activeFilters = useMemo(() => {
    const types = new Set(achievements.map((a) => a.achievement_type));
    return ALL_FILTERS.filter((f) => f === "all" || types.has(f));
  }, [achievements]);

  const filtered =
    filter === "all"
      ? achievements
      : achievements.filter((a) => a.achievement_type === filter);

  const levelInfo = reputation ? getLevelInfo(reputation.points) : getLevelInfo(0);

  const totalPoints = useMemo(
    () => achievements.reduce((s, a) => s + (getMeta(a.achievement_type).points || 0), 0),
    [achievements],
  );

  if (!address) {
    return (
      <div style={{ maxWidth: "var(--lc-content-narrow)", margin: "0 auto" }}>
        <Breadcrumb items={[{ label: "Achievements" }]} />
        <ConnectWalletGate message="Connect your wallet to view your achievements and reputation." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "var(--lc-content-narrow)", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
      <Breadcrumb items={[{ label: "Achievements" }]} />

      <h1 style={{ fontSize: "var(--lc-text-title)", fontWeight: 700, color: "var(--lc-text)" }}>
        Achievements & Reputation
      </h1>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
          <Skeleton variant="card" height="180px" />
          <div style={{ display: "flex", gap: "var(--lc-space-3)" }}>
            <Skeleton variant="card" height="80px" />
            <Skeleton variant="card" height="80px" />
            <Skeleton variant="card" height="80px" />
          </div>
          <Skeleton variant="text" count={4} />
        </div>
      )}

      {/* ── Reputation Hero Card ─────────────────────────────────────── */}
      {!loading && reputation && (
        <div style={{
          padding: "var(--lc-space-6)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          background: `linear-gradient(135deg, ${levelInfo.color}08 0%, transparent 60%)`,
          backgroundColor: "var(--lc-bg-raised)",
          boxShadow: "var(--lc-shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--lc-space-5)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--lc-space-4)" }}>
            {/* Level badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-4)" }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${levelInfo.color}, ${levelInfo.color}88)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 800,
                color: "#fff",
                boxShadow: `0 4px 20px ${levelInfo.color}33`,
              }}>
                {reputation.level}
              </div>
              <div>
                <div style={{ fontSize: "var(--lc-text-subhead)", fontWeight: 700, color: "var(--lc-text)" }}>
                  {reputation.levelName}
                </div>
                <div style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
                  {reputation.points.toLocaleString()} total points
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: "flex", gap: "var(--lc-space-4)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--lc-text)" }}>{achievements.length}</div>
                <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Achievements</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--lc-success)" }}>{reputation.victories}</div>
                <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Victories</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--lc-accent)" }}>{reputation.completions}</div>
                <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Completions</div>
              </div>
            </div>
          </div>

          {/* XP Progress bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
              <span>Level {reputation.level}</span>
              {levelInfo.nextThreshold ? (
                <span>{levelInfo.nextThreshold.toLocaleString()} pts to Level {reputation.level + 1}</span>
              ) : (
                <span>Max level reached!</span>
              )}
            </div>
            <div style={{
              height: 10,
              borderRadius: 5,
              backgroundColor: "var(--lc-bg-subtle)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${levelInfo.pct}%`,
                background: `linear-gradient(90deg, ${levelInfo.color}, ${levelInfo.color}cc)`,
                borderRadius: 5,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Stat cards row ────────────────────────────────────────────── */}
      {!loading && (
        <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
          <StatCard
            label="Total Points"
            value={totalPoints.toLocaleString()}
            color={levelInfo.color}
          />
          <StatCard
            label="Unique Types"
            value={new Set(achievements.map((a) => a.achievement_type)).size}
            sub={`of ${Object.keys(ACHIEVEMENT_TYPES).length} types`}
          />
          <StatCard
            label="Win Rate"
            value={achievements.length > 0
              ? `${Math.round((achievements.filter((a) => a.achievement_type === "victory").length / achievements.length) * 100)}%`
              : "0%"}
          />
          <StatCard
            label="Latest"
            value={achievements.length > 0
              ? getMeta(achievements[0].achievement_type).icon
              : "--"}
            sub={achievements.length > 0
              ? getMeta(achievements[0].achievement_type).label
              : undefined}
          />
        </div>
      )}

      {/* ── Achievement breakdown + Milestones ────────────────────────── */}
      {!loading && achievements.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--lc-space-4)" }}>
          <TypeBreakdown achievements={achievements} />
          <MilestoneTracker achievements={achievements} reputation={reputation} />
        </div>
      )}

      {/* ── Filter tabs ───────────────────────────────────────────────── */}
      {!loading && achievements.length > 0 && (
        <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap" }}>
          {activeFilters.map((f) => {
            const meta = f === "all" ? null : getMeta(f);
            const count = f === "all" ? achievements.length : achievements.filter((a) => a.achievement_type === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--lc-radius-pill)",
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: 500,
                  color: filter === f ? "var(--lc-select-text)" : "var(--lc-text-secondary)",
                  backgroundColor: filter === f
                    ? "var(--lc-select)"
                    : "transparent",
                  border: filter === f ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {meta && <span>{meta.icon}</span>}
                {f === "all" ? `All (${count})` : `${meta?.label} (${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!loading && achievements.length === 0 && (
        <EmptyState
          title="No achievements yet"
          description="Complete challenges to earn soulbound NFT tokens and build your reputation. Each achievement type earns different points toward your level."
          actionLabel="Explore Challenges"
          onAction={() => (window.location.href = "/explore")}
        />
      )}

      {/* ── Achievement grid ──────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "var(--lc-space-3)",
        }}>
          {filtered.map((a) => {
            const meta = getMeta(a.achievement_type);
            return (
              <Link
                key={a.token_id}
                href={`/challenge/${a.challenge_id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--lc-space-3)",
                  padding: "var(--lc-space-4)",
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  backgroundColor: "var(--lc-bg-raised)",
                  boxShadow: "var(--lc-shadow-sm)",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-border-strong)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "var(--lc-shadow-md)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-border)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "var(--lc-shadow-sm)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                {/* Type icon */}
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  backgroundColor: meta.bgColor,
                  fontSize: 20,
                }}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "var(--lc-text-small)",
                      fontWeight: 600,
                      color: "var(--lc-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {meta.label}
                      {a.title ? `: ${a.title}` : ` #${a.challenge_id}`}
                    </span>
                    <Badge variant="tone" tone={a.achievement_type === "victory" ? "success" : "accent"} size="sm">
                      +{meta.points} pts
                    </Badge>
                  </div>
                  <div style={{
                    fontSize: "var(--lc-text-caption)",
                    color: "var(--lc-text-muted)",
                    marginTop: 2,
                  }}>
                    {new Date(a.minted_at).toLocaleDateString()} &middot; Token #{a.token_id}
                  </div>
                </div>

                {/* Arrow */}
                <span style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)", flexShrink: 0 }}>
                  &rsaquo;
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Points guide ──────────────────────────────────────────────── */}
      {!loading && (
        <details style={{
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-raised)",
          padding: "var(--lc-space-4)",
        }}>
          <summary style={{
            cursor: "pointer",
            fontSize: "var(--lc-text-small)",
            fontWeight: 600,
            color: "var(--lc-text)",
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: "var(--lc-space-2)",
          }}>
            <span style={{ color: "var(--lc-text-muted)" }}>{"\u25B6"}</span>
            Points Guide &mdash; How achievements are scored
          </summary>
          <div style={{
            marginTop: "var(--lc-space-4)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "var(--lc-space-2)",
          }}>
            {Object.entries(ACHIEVEMENT_TYPES).map(([key, meta]) => (
              <div key={key} style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
                padding: "var(--lc-space-2) var(--lc-space-3)",
                borderRadius: "var(--lc-radius-md)",
                border: "1px solid var(--lc-border)",
              }}>
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--lc-text-caption)", fontWeight: 500, color: "var(--lc-text)" }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--lc-text-muted)" }}>{meta.description}</div>
                </div>
                <span style={{
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: 700,
                  color: meta.color,
                }}>{meta.points}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "var(--lc-space-4)" }}>
            <div style={{ fontSize: "var(--lc-text-caption)", fontWeight: 600, color: "var(--lc-text)", marginBottom: "var(--lc-space-2)" }}>
              Level Thresholds
            </div>
            <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap" }}>
              {LEVEL_THRESHOLDS.map((t) => (
                <div key={t.level} style={{
                  padding: "4px 12px",
                  borderRadius: "var(--lc-radius-pill)",
                  fontSize: "var(--lc-text-caption)",
                  backgroundColor: `${t.color}18`,
                  color: t.color,
                  fontWeight: 600,
                }}>
                  L{t.level} {t.name}: {t.min}+
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
