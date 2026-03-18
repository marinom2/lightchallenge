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
    <div className="p-4 rounded-lg border bg-raised text-center" style={{ flex: "1 1 0", minWidth: 100 }}>
      <div className="text-heading font-bold" style={color ? { color } : undefined}>{value}</div>
      <div className="text-caption color-secondary" style={{ marginTop: 2 }}>{label}</div>
      {sub && <div className="text-caption color-muted" style={{ marginTop: 2 }}>{sub}</div>}
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
    <div className="p-5 rounded-lg border bg-raised stack-3">
      <div className="text-small font-semibold">
        Achievement Breakdown
      </div>
      {counts.map(([type, count]) => {
        const meta = getMeta(type);
        return (
          <div key={type} className="row-3">
            <span className="text-center shrink-0" style={{ fontSize: 16, width: 24 }}>{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex-between" style={{ marginBottom: 3 }}>
                <span className="text-caption color-secondary">{meta.label}</span>
                <span className="text-caption font-semibold">{count}</span>
              </div>
              <div className="overflow-hidden" style={{ height: 6, borderRadius: 3, backgroundColor: "var(--lc-bg-subtle)" }}>
                <div className="h-full rounded-pill transition-slow" style={{
                  width: `${(count / max) * 100}%`,
                  backgroundColor: meta.color,
                  borderRadius: 3,
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
  const [expanded, setExpanded] = useState(false);

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

  const VISIBLE_COUNT = 4;
  const visible = expanded ? milestones : milestones.slice(0, VISIBLE_COUNT);
  const hasMore = milestones.length > VISIBLE_COUNT;

  return (
    <div className="p-5 rounded-lg border bg-raised stack-3">
      <div className="text-small font-semibold">
        Milestones
      </div>
      <div className="stack-2">
        {visible.map((m) => {
          const done = m.current >= m.target;
          const pct = Math.min(100, Math.round((m.current / m.target) * 100));
          return (
            <div key={m.label} className={`p-3 rounded-md row-2 ${done ? "bg-success-muted" : "bg-transparent"}`}
              style={{
                border: `1px solid ${done ? "var(--lc-success)" : "var(--lc-border)"}`,
                opacity: done ? 1 : 0.7,
              }}>
              <span className="shrink-0" style={{ fontSize: 18 }}>{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-caption font-medium ${done ? "color-success" : "color-secondary"}`}>
                  {m.label}
                </div>
                {!done && (
                  <div className="overflow-hidden" style={{ height: 4, borderRadius: 2, backgroundColor: "var(--lc-bg-subtle)", marginTop: 4 }}>
                    <div className="h-full bg-accent" style={{ width: `${pct}%`, borderRadius: 2 }} />
                  </div>
                )}
              </div>
              {done && <span className="color-success" style={{ fontSize: 14 }}>{"\u2713"}</span>}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-caption color-accent font-medium cursor-pointer"
          style={{ background: "none", border: "none", padding: 0 }}
        >
          {expanded ? "Show less" : `Show all ${milestones.length} milestones`}
        </button>
      )}
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
      <div className="mx-auto" style={{ maxWidth: "var(--lc-content-narrow)" }}>
        <Breadcrumb items={[{ label: "Achievements" }]} />
        <ConnectWalletGate message="Connect your wallet to view your achievements and reputation." />
      </div>
    );
  }

  return (
    <div className="mx-auto stack-6" style={{ maxWidth: "var(--lc-content-narrow)" }}>
      <Breadcrumb items={[{ label: "Achievements" }]} />

      <h1 className="page-header__title">
        Achievements & Reputation
      </h1>

      {/* Loading */}
      {loading && (
        <div className="stack-4">
          <Skeleton variant="card" height="180px" />
          <div className="d-flex gap-3">
            <Skeleton variant="card" height="80px" />
            <Skeleton variant="card" height="80px" />
            <Skeleton variant="card" height="80px" />
          </div>
          <Skeleton variant="text" count={4} />
        </div>
      )}

      {/* ── Reputation Hero Card ─────────────────────────────────────── */}
      {!loading && reputation && (
        <div className="p-6 rounded-lg border bg-raised shadow-sm stack-5"
          style={{ background: `linear-gradient(135deg, ${levelInfo.color}08 0%, transparent 60%), var(--lc-bg-raised)` }}>
          <div className="d-flex flex-wrap justify-between items-start gap-4">
            {/* Level badge */}
            <div className="row-4">
              <div className="circle-icon" style={{
                width: 64, height: 64,
                background: `linear-gradient(135deg, ${levelInfo.color}, ${levelInfo.color}88)`,
                fontSize: 28, fontWeight: 800, color: "#fff",
                boxShadow: `0 4px 20px ${levelInfo.color}33`,
              }}>
                {reputation.level}
              </div>
              <div>
                <div className="text-subhead font-bold">{reputation.levelName}</div>
                <div className="text-small color-secondary">{reputation.points.toLocaleString()} total points</div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="d-flex gap-4">
              <div className="text-center">
                <div className="font-bold" style={{ fontSize: 22 }}>{achievements.length}</div>
                <div className="text-caption color-muted">Achievements</div>
              </div>
              <div className="text-center">
                <div className="font-bold color-success" style={{ fontSize: 22 }}>{reputation.victories}</div>
                <div className="text-caption color-muted">Victories</div>
              </div>
              <div className="text-center">
                <div className="font-bold color-accent" style={{ fontSize: 22 }}>{reputation.completions}</div>
                <div className="text-caption color-muted">Completions</div>
              </div>
            </div>
          </div>

          {/* XP Progress bar */}
          <div>
            <div className="flex-between text-caption color-muted" style={{ marginBottom: 8 }}>
              <span>Level {reputation.level}</span>
              {levelInfo.nextThreshold ? (
                <span>{levelInfo.nextThreshold.toLocaleString()} pts to Level {reputation.level + 1}</span>
              ) : (
                <span>Max level reached!</span>
              )}
            </div>
            <div className="overflow-hidden" style={{ height: 10, borderRadius: 5, backgroundColor: "var(--lc-bg-subtle)" }}>
              <div className="h-full transition-slow" style={{
                width: `${levelInfo.pct}%`,
                background: `linear-gradient(90deg, ${levelInfo.color}, ${levelInfo.color}cc)`,
                borderRadius: 5,
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Stat cards row ────────────────────────────────────────────── */}
      {!loading && (
        <div className="d-flex flex-wrap gap-3">
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
        <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <TypeBreakdown achievements={achievements} />
          <MilestoneTracker achievements={achievements} reputation={reputation} />
        </div>
      )}

      {/* ── Filter tabs ───────────────────────────────────────────────── */}
      {!loading && achievements.length > 0 && (
        <div className="d-flex flex-wrap gap-2">
          {activeFilters.map((f) => {
            const meta = f === "all" ? null : getMeta(f);
            const count = f === "all" ? achievements.length : achievements.filter((a) => a.achievement_type === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`filter-pill ${filter === f ? "filter-pill--active" : ""}`}
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
        <div className="d-grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {filtered.map((a) => {
            const meta = getMeta(a.achievement_type);
            return (
              <Link
                key={a.token_id}
                href={`/challenge/${a.challenge_id}`}
                className="row-3 p-4 rounded-lg border bg-raised shadow-sm transition-base"
                style={{ textDecoration: "none" }}
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
                <div className="circle-icon shrink-0" style={{ width: 44, height: 44, backgroundColor: meta.bgColor, fontSize: 20 }}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="row-2 flex-wrap">
                    <span className="text-small font-semibold text-ellipsis">
                      {meta.label}
                      {a.title ? `: ${a.title}` : ` #${a.challenge_id}`}
                    </span>
                    <Badge variant="tone" tone={a.achievement_type === "victory" ? "success" : "accent"} size="sm">
                      +{meta.points} pts
                    </Badge>
                  </div>
                  <div className="text-caption color-muted" style={{ marginTop: 2 }}>
                    {new Date(a.minted_at).toLocaleDateString()} &middot; Token #{a.token_id}
                  </div>
                </div>

                {/* Arrow */}
                <span className="color-muted text-small shrink-0">&rsaquo;</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Points guide ──────────────────────────────────────────────── */}
      {!loading && (
        <details className="rounded-lg border bg-raised p-4">
          <summary className="cursor-pointer text-small font-semibold row-2" style={{ listStyle: "none" }}>
            <span className="color-muted">{"\u25B6"}</span>
            Points Guide &mdash; How achievements are scored
          </summary>
          <div className="mt-4 d-grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {Object.entries(ACHIEVEMENT_TYPES).map(([key, meta]) => (
              <div key={key} className="row-2 py-2 px-3 rounded-md border">
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <div className="flex-1">
                  <div className="text-caption font-medium">{meta.label}</div>
                  <div className="color-muted" style={{ fontSize: 11 }}>{meta.description}</div>
                </div>
                <span className="text-caption font-bold" style={{ color: meta.color }}>{meta.points}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="text-caption font-semibold mb-2">Level Thresholds</div>
            <div className="d-flex flex-wrap gap-2">
              {LEVEL_THRESHOLDS.map((t) => (
                <div key={t.level} className="rounded-pill text-caption font-semibold" style={{
                  padding: "4px 12px",
                  backgroundColor: `${t.color}18`,
                  color: t.color,
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
