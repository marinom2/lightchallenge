"use client";

import React, { useEffect, useState } from "react";
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

const LEVEL_THRESHOLDS = [
  { min: 0, max: 100, level: 1, name: "Newcomer" },
  { min: 100, max: 300, level: 2, name: "Challenger" },
  { min: 300, max: 800, level: 3, name: "Competitor" },
  { min: 800, max: 2000, level: 4, name: "Champion" },
  { min: 2000, max: Infinity, level: 5, name: "Legend" },
];

function progressPercent(points: number): number {
  const t = LEVEL_THRESHOLDS.find((t) => points >= t.min && points < t.max);
  if (!t || t.max === Infinity) return 100;
  return Math.round(((points - t.min) / (t.max - t.min)) * 100);
}

function nextThreshold(points: number): number | null {
  const t = LEVEL_THRESHOLDS.find((t) => points >= t.min && points < t.max);
  if (!t || t.max === Infinity) return null;
  return t.max;
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function AchievementsPage() {
  const { address } = useAccount();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completion" | "victory">("all");

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

  const filtered =
    filter === "all"
      ? achievements
      : achievements.filter((a) => a.achievement_type === filter);

  const pct = reputation ? progressPercent(reputation.points) : 0;
  const nextLevel = reputation ? nextThreshold(reputation.points) : null;

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

      <h1 style={{ fontSize: "var(--lc-text-title)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
        Achievements
      </h1>

      {/* Loading state */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
          <Skeleton variant="card" height="120px" />
          <Skeleton variant="text" count={3} />
        </div>
      )}

      {/* Reputation card */}
      {!loading && reputation && (
        <div
          style={{
            padding: "var(--lc-space-6)",
            borderRadius: "var(--lc-radius-lg)",
            border: "1px solid var(--lc-border)",
            backgroundColor: "var(--lc-bg-raised)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--lc-space-4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--lc-space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)" }}>
              {/* Level icon */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "var(--lc-accent-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--lc-text-heading)",
                  fontWeight: "var(--lc-weight-bold)" as any,
                  color: "var(--lc-accent)",
                }}
              >
                {reputation.level}
              </div>
              <div>
                <div style={{ fontSize: "var(--lc-text-subhead)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>
                  {reputation.levelName}
                </div>
                <div style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
                  Level {reputation.level} &middot; {reputation.points} pts
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--lc-space-6)", fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
                  {reputation.completions}
                </div>
                <div>Completions</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
                  {reputation.victories}
                </div>
                <div>Victories</div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
              <span>{reputation.points} pts</span>
              {nextLevel && <span>{nextLevel} pts to next level</span>}
            </div>
            <div className="progress-bar">
              <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {!loading && (
        <div style={{ display: "flex", gap: "var(--lc-space-2)" }}>
          {(["all", "completion", "victory"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--lc-radius-pill)",
                fontSize: "var(--lc-text-caption)",
                fontWeight: "var(--lc-weight-medium)" as any,
                color: filter === f ? "var(--lc-accent-text)" : "var(--lc-text-secondary)",
                backgroundColor: filter === f ? "var(--lc-accent)" : "transparent",
                border: filter === f ? "none" : "1px solid var(--lc-border)",
                cursor: "pointer",
                transition: "all var(--lc-dur-fast) var(--lc-ease)",
                textTransform: "capitalize",
              }}
            >
              {f === "all" ? `All (${achievements.length})` : `${f} (${achievements.filter((a) => a.achievement_type === f).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Achievement list */}
      {!loading && filtered.length === 0 && (
        <EmptyState
          title="No achievements yet"
          description="Complete challenges to earn soulbound NFT tokens and build your reputation."
          actionLabel="Explore Challenges"
          onAction={() => window.location.href = "/explore"}
        />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
          {filtered.map((a) => (
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
                textDecoration: "none",
                transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
              }}
            >
              {/* Type badge */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  backgroundColor: a.achievement_type === "victory"
                    ? "var(--lc-success-muted)"
                    : "var(--lc-accent-muted)",
                  color: a.achievement_type === "victory"
                    ? "var(--lc-success)"
                    : "var(--lc-accent)",
                  fontSize: "var(--lc-text-body)",
                }}
              >
                {a.achievement_type === "victory" ? "\u2605" : "\u2713"}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
                  <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-medium)" as any, color: "var(--lc-text)" }}>
                    {a.achievement_type === "victory" ? "Victory" : "Completion"}
                    {a.title ? `: ${a.title}` : ` #${a.challenge_id}`}
                  </span>
                  <Badge
                    variant="tone"
                    tone={a.achievement_type === "victory" ? "success" : "accent"}
                    size="sm"
                  >
                    {a.achievement_type === "victory" ? "+150 pts" : "+50 pts"}
                  </Badge>
                </div>
                <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>
                  {new Date(a.minted_at).toLocaleDateString()} &middot; Token #{a.token_id}
                </div>
              </div>

              {/* Arrow */}
              <span style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)", flexShrink: 0 }}>
                &rsaquo;
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
