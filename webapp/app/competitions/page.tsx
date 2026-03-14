"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/app/components/ui/Badge";
import Skeleton from "@/app/components/ui/Skeleton";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import StatCard from "@/app/components/ui/StatCard";
import { formatEther } from "viem";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Metrics = {
  achievements: { total: number; completions: number; victories: number };
  reputation: { total_users: number; levels: { level: number; name: string; users: number }[] };
  challenges: { total: number; active: number; finalized: number; with_verdicts: number; with_evidence: number };
  claims: { total: number; total_wei: string; unique_claimants: number };
  providers: { provider: string; submissions: number; unique_subjects: number }[];
  categories: { category: string; count: number }[];
  leaderboard: {
    rank: number; subject: string; points: number;
    level: number; level_name: string;
    completions: number; victories: number;
  }[];
  recent_achievements: {
    token_id: string; challenge_id: string; recipient: string;
    achievement_type: string; minted_at: string; challenge_title: string | null;
  }[];
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const PROVIDER_LABELS: Record<string, { label: string; icon: string }> = {
  garmin: { label: "Garmin", icon: "watch" },
  strava: { label: "Strava", icon: "run" },
  apple_health: { label: "Apple Health", icon: "heart" },
  fitbit: { label: "Fitbit", icon: "activity" },
  google_fit: { label: "Google Fit", icon: "trending" },
  opendota: { label: "Dota 2", icon: "game" },
  riot: { label: "League of Legends", icon: "game" },
  steam: { label: "CS2 / Steam", icon: "game" },
};

const CATEGORY_COLORS: Record<string, string> = {
  fitness: "var(--lc-success)",
  gaming: "var(--lc-accent)",
  social: "var(--lc-warning)",
  custom: "var(--lc-text-secondary)",
  uncategorized: "var(--lc-text-muted)",
};

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function TrophyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function UsersIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function BarChartIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  );
}

function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function CompetitionsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("leaderboard");

  useEffect(() => {
    fetch("/api/protocol/metrics")
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabs: Tab[] = [
    { id: "leaderboard", label: "Leaderboard", count: metrics?.leaderboard.length },
    { id: "achievements", label: "Recent Achievements", count: metrics?.recent_achievements.length },
    { id: "providers", label: "Evidence Providers", count: metrics?.providers.length },
  ];

  const totalPool = metrics?.claims.total_wei
    ? Number(formatEther(BigInt(metrics.claims.total_wei))).toFixed(1)
    : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-8)" }}>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "var(--lc-space-8) 0 var(--lc-space-4)" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--lc-space-2)",
            padding: "4px 12px",
            borderRadius: "var(--lc-radius-pill)",
            backgroundColor: "var(--lc-accent-muted)",
            color: "var(--lc-accent)",
            fontSize: "var(--lc-text-caption)",
            fontWeight: "var(--lc-weight-medium)" as any,
            marginBottom: "var(--lc-space-4)",
          }}
        >
          <TrophyIcon size={14} />
          Competition Infrastructure
        </div>

        <h1
          style={{
            fontSize: "var(--lc-text-title)",
            fontWeight: "var(--lc-weight-bold)" as any,
            color: "var(--lc-text)",
            letterSpacing: "var(--lc-tracking-tight)",
            marginBottom: "var(--lc-space-3)",
            lineHeight: "var(--lc-leading-tight)" as any,
          }}
        >
          Verified Competitions.{" "}
          <span style={{ color: "var(--lc-accent)" }}>Trustless Prizes.</span>
        </h1>

        <p
          style={{
            fontSize: "var(--lc-text-body)",
            color: "var(--lc-text-secondary)",
            maxWidth: 560,
            margin: "0 auto var(--lc-space-6)",
            lineHeight: "var(--lc-leading-normal)" as any,
          }}
        >
          On-chain prize escrow, AI-powered evidence verification, and soulbound achievement
          tokens. The only competition platform spanning esports and fitness with
          cryptographic proof of results.
        </p>

        <div style={{ display: "flex", gap: "var(--lc-space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/explore"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              padding: "10px 20px",
              borderRadius: "var(--lc-radius-md)",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-medium)" as any,
              textDecoration: "none",
              transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            Explore Challenges
          </Link>
          <Link
            href="/challenges/create"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              padding: "10px 20px",
              borderRadius: "var(--lc-radius-md)",
              backgroundColor: "transparent",
              color: "var(--lc-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-medium)" as any,
              textDecoration: "none",
              border: "1px solid var(--lc-border)",
              transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            Create Competition
          </Link>
        </div>
      </section>

      {/* ── Stats Row ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--lc-space-4)" }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" height="80px" />
          ))}
        </div>
      ) : metrics ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--lc-space-4)",
            padding: "var(--lc-space-4)",
            borderRadius: "var(--lc-radius-lg)",
            border: "1px solid var(--lc-border)",
            backgroundColor: "var(--lc-bg-raised)",
          }}
        >
          <StatCard label="Challenges" value={metrics.challenges.total} icon={<BarChartIcon />} />
          <StatCard label="Active" value={metrics.challenges.active} icon={<span style={{ color: "var(--lc-success)" }}>&#9679;</span>} />
          <StatCard label="Competitors" value={metrics.reputation.total_users} icon={<UsersIcon />} />
          <StatCard label="Verified" value={metrics.challenges.with_verdicts} icon={<ShieldIcon />} />
          <StatCard label="Achievements" value={metrics.achievements.total} icon={<StarIcon />} />
          <StatCard label="Pool Claimed" value={totalPool} unit="LCAI" icon={<TrophyIcon />} />
        </div>
      ) : null}

      {/* ── How It Works ─────────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)", marginBottom: "var(--lc-space-4)" }}>
          How Competitions Work
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--lc-space-4)" }}>
          {[
            { step: "01", title: "Create or Join", desc: "Pick a challenge and stake your entry. Funds are held in smart contract escrow." },
            { step: "02", title: "Compete & Submit", desc: "Complete the challenge. Upload evidence from fitness trackers or gaming APIs." },
            { step: "03", title: "AI Verifies", desc: "AIVM evaluators process your evidence through Proof-of-Intelligence consensus." },
            { step: "04", title: "Claim Rewards", desc: "Winners claim from the prize pool. Earn soulbound achievement NFTs." },
          ].map((s) => (
            <div
              key={s.step}
              style={{
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--lc-space-3)",
              }}
            >
              <span
                style={{
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: "var(--lc-weight-bold)" as any,
                  color: "var(--lc-accent)",
                  fontFamily: "var(--lc-font-mono)",
                }}
              >
                {s.step}
              </span>
              <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>
                {s.title}
              </span>
              <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)", lineHeight: "var(--lc-leading-normal)" as any }}>
                {s.desc}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────────────────────────── */}
      {metrics && metrics.categories.length > 0 && (
        <section>
          <h2 style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)", marginBottom: "var(--lc-space-4)" }}>
            Categories
          </h2>
          <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
            {metrics.categories.map((cat) => (
              <Link
                key={cat.category}
                href={`/explore?category=${cat.category}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--lc-space-2)",
                  padding: "var(--lc-space-3) var(--lc-space-4)",
                  borderRadius: "var(--lc-radius-md)",
                  border: "1px solid var(--lc-border)",
                  backgroundColor: "var(--lc-bg-raised)",
                  textDecoration: "none",
                  transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: CATEGORY_COLORS[cat.category] || "var(--lc-text-muted)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-medium)" as any, color: "var(--lc-text)", textTransform: "capitalize" }}>
                  {cat.category}
                </span>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                  {cat.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Tabbed Content ───────────────────────────────────────────────────── */}
      <section>
        <Tabs tabs={tabs} activeId={activeTab} onTabChange={setActiveTab} />

        <div style={{ marginTop: "var(--lc-space-4)" }}>
          {/* Leaderboard Tab */}
          {activeTab === "leaderboard" && (
            <>
              {loading ? (
                <Skeleton variant="text" count={5} />
              ) : metrics && metrics.leaderboard.length > 0 ? (
                <div
                  style={{
                    borderRadius: "var(--lc-radius-lg)",
                    border: "1px solid var(--lc-border)",
                    overflow: "hidden",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "48px 1fr 100px 80px 80px 80px",
                      padding: "var(--lc-space-3) var(--lc-space-4)",
                      backgroundColor: "var(--lc-bg-inset)",
                      fontSize: "var(--lc-text-caption)",
                      fontWeight: "var(--lc-weight-medium)" as any,
                      color: "var(--lc-text-muted)",
                      gap: "var(--lc-space-2)",
                    }}
                    className="comp-table-header"
                  >
                    <span>#</span>
                    <span>Competitor</span>
                    <span style={{ textAlign: "right" }}>Points</span>
                    <span style={{ textAlign: "right" }}>Level</span>
                    <span style={{ textAlign: "right" }}>Wins</span>
                    <span style={{ textAlign: "right" }}>Done</span>
                  </div>

                  {/* Rows */}
                  {metrics.leaderboard.map((entry, i) => (
                    <div
                      key={entry.subject}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "48px 1fr 100px 80px 80px 80px",
                        padding: "var(--lc-space-3) var(--lc-space-4)",
                        backgroundColor: i % 2 === 0 ? "var(--lc-bg-raised)" : "var(--lc-bg)",
                        borderTop: "1px solid var(--lc-border)",
                        alignItems: "center",
                        gap: "var(--lc-space-2)",
                        transition: "background-color var(--lc-dur-fast) var(--lc-ease)",
                      }}
                      className="comp-table-row"
                    >
                      <span
                        style={{
                          fontSize: "var(--lc-text-small)",
                          fontWeight: "var(--lc-weight-bold)" as any,
                          color: i < 3 ? "var(--lc-accent)" : "var(--lc-text-muted)",
                        }}
                      >
                        {i < 3 ? ["1st", "2nd", "3rd"][i] : entry.rank}
                      </span>

                      <span
                        style={{
                          fontSize: "var(--lc-text-small)",
                          color: "var(--lc-text)",
                          fontFamily: "var(--lc-font-mono)",
                        }}
                      >
                        {truncAddr(entry.subject)}
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontSize: "var(--lc-text-small)",
                          fontWeight: "var(--lc-weight-semibold)" as any,
                          color: "var(--lc-text)",
                        }}
                      >
                        {entry.points}
                      </span>

                      <span style={{ textAlign: "right" }}>
                        <Badge
                          variant="tone"
                          tone={entry.level >= 4 ? "warning" : entry.level >= 3 ? "success" : "accent"}
                          size="sm"
                        >
                          {entry.level_name}
                        </Badge>
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontSize: "var(--lc-text-small)",
                          color: "var(--lc-text-secondary)",
                        }}
                      >
                        {entry.victories}
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontSize: "var(--lc-text-small)",
                          color: "var(--lc-text-secondary)",
                        }}
                      >
                        {entry.completions}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)", textAlign: "center", padding: "var(--lc-space-8)" }}>
                  No competitors yet. Be the first to compete!
                </p>
              )}

              <div style={{ textAlign: "center", marginTop: "var(--lc-space-4)" }}>
                <Link
                  href="/me/achievements"
                  style={{
                    fontSize: "var(--lc-text-small)",
                    color: "var(--lc-accent)",
                    textDecoration: "none",
                  }}
                >
                  View your achievements &rarr;
                </Link>
              </div>
            </>
          )}

          {/* Recent Achievements Tab */}
          {activeTab === "achievements" && (
            <>
              {loading ? (
                <Skeleton variant="text" count={5} />
              ) : metrics && metrics.recent_achievements.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
                  {metrics.recent_achievements.map((ach) => (
                    <Link
                      key={ach.token_id}
                      href={`/challenge/${ach.challenge_id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--lc-space-3)",
                        padding: "var(--lc-space-3) var(--lc-space-4)",
                        borderRadius: "var(--lc-radius-md)",
                        border: "1px solid var(--lc-border)",
                        backgroundColor: "var(--lc-bg-raised)",
                        textDecoration: "none",
                        transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
                      }}
                    >
                      {/* Icon */}
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          backgroundColor: ach.achievement_type === "victory" ? "var(--lc-success-muted)" : "var(--lc-accent-muted)",
                          color: ach.achievement_type === "victory" ? "var(--lc-success)" : "var(--lc-accent)",
                          fontSize: "var(--lc-text-body)",
                        }}
                      >
                        {ach.achievement_type === "victory" ? "\u2605" : "\u2713"}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
                          <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-medium)" as any, color: "var(--lc-text)" }}>
                            {ach.achievement_type === "victory" ? "Victory" : "Completion"}
                            {ach.challenge_title ? `: ${ach.challenge_title}` : ` #${ach.challenge_id}`}
                          </span>
                          <Badge
                            variant="tone"
                            tone={ach.achievement_type === "victory" ? "success" : "accent"}
                            size="sm"
                          >
                            {ach.achievement_type === "victory" ? "+150 pts" : "+50 pts"}
                          </Badge>
                        </div>
                        <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>
                          {truncAddr(ach.recipient)} &middot; {timeAgo(ach.minted_at)} &middot; Token #{ach.token_id}
                        </div>
                      </div>

                      {/* Arrow */}
                      <span style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)", flexShrink: 0 }}>
                        &rsaquo;
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)", textAlign: "center", padding: "var(--lc-space-8)" }}>
                  No achievements minted yet.
                </p>
              )}
            </>
          )}

          {/* Evidence Providers Tab */}
          {activeTab === "providers" && (
            <>
              {loading ? (
                <Skeleton variant="text" count={4} />
              ) : metrics && metrics.providers.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--lc-space-3)" }}>
                  {metrics.providers.map((p) => {
                    const info = PROVIDER_LABELS[p.provider] || { label: p.provider, icon: "data" };
                    return (
                      <div
                        key={p.provider}
                        style={{
                          padding: "var(--lc-space-4)",
                          borderRadius: "var(--lc-radius-lg)",
                          border: "1px solid var(--lc-border)",
                          backgroundColor: "var(--lc-bg-raised)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "var(--lc-space-2)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-medium)" as any, color: "var(--lc-text)" }}>
                            {info.label}
                          </span>
                          <Badge variant="tone" tone="accent" size="sm">
                            {p.provider}
                          </Badge>
                        </div>
                        <div style={{ display: "flex", gap: "var(--lc-space-6)" }}>
                          <div>
                            <div style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
                              {p.submissions}
                            </div>
                            <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                              Submissions
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
                              {p.unique_subjects}
                            </div>
                            <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                              Competitors
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)", textAlign: "center", padding: "var(--lc-space-8)" }}>
                  No evidence submissions yet.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Differentiators ──────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)", marginBottom: "var(--lc-space-4)" }}>
          Why LightChallenge
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--lc-space-4)" }}>
          {[
            {
              title: "Trustless Prize Escrow",
              desc: "Funds locked in smart contracts. No organizer can run off with the pool. Refunds are automatic on cancellation.",
              icon: <ShieldIcon />,
            },
            {
              title: "AI-Verified Results",
              desc: "AIVM Proof-of-Intelligence consensus verifies evidence. No manual reporting. Cryptographic proof chain.",
              icon: <BarChartIcon />,
            },
            {
              title: "Cross-Category",
              desc: "Gaming (Dota 2, LoL, CS2) and fitness (Steps, Running, Cycling) on one platform with unified escrow.",
              icon: <UsersIcon />,
            },
            {
              title: "Soulbound Achievements",
              desc: "Earn non-transferable ERC-5192 tokens proving your competition results. Build on-chain reputation.",
              icon: <TrophyIcon />,
            },
          ].map((d) => (
            <div
              key={d.title}
              style={{
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--lc-space-3)",
              }}
            >
              <span style={{ color: "var(--lc-accent)" }}>{d.icon}</span>
              <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>
                {d.title}
              </span>
              <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)", lineHeight: "var(--lc-leading-normal)" as any }}>
                {d.desc}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Reputation Levels ────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)", marginBottom: "var(--lc-space-4)" }}>
          Reputation Levels
        </h2>
        <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
          {[
            { level: 1, name: "Newcomer", min: 0, max: 100 },
            { level: 2, name: "Challenger", min: 100, max: 300 },
            { level: 3, name: "Competitor", min: 300, max: 800 },
            { level: 4, name: "Champion", min: 800, max: 2000 },
            { level: 5, name: "Legend", min: 2000, max: null },
          ].map((lvl) => {
            const userCount = metrics?.reputation.levels.find((l) => l.level === lvl.level)?.users ?? 0;
            return (
              <div
                key={lvl.level}
                style={{
                  flex: "1 1 140px",
                  padding: "var(--lc-space-4)",
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  backgroundColor: "var(--lc-bg-raised)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--lc-space-2)",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    backgroundColor: "var(--lc-accent-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--lc-text-subhead)",
                    fontWeight: "var(--lc-weight-bold)" as any,
                    color: "var(--lc-accent)",
                  }}
                >
                  {lvl.level}
                </div>
                <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>
                  {lvl.name}
                </span>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                  {lvl.min}{lvl.max ? `\u2013${lvl.max}` : "+"} pts
                </span>
                {userCount > 0 && (
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
                    {userCount} {userCount === 1 ? "user" : "users"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section
        style={{
          textAlign: "center",
          padding: "var(--lc-space-8)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-raised)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--lc-text-heading)",
            fontWeight: "var(--lc-weight-semibold)" as any,
            color: "var(--lc-text)",
            marginBottom: "var(--lc-space-2)",
          }}
        >
          Ready to compete?
        </h2>
        <p
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-secondary)",
            marginBottom: "var(--lc-space-4)",
            maxWidth: 400,
            margin: "0 auto var(--lc-space-4)",
          }}
        >
          Join active challenges, prove your skills, and earn on-chain achievements.
        </p>
        <div style={{ display: "flex", gap: "var(--lc-space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/explore"
            style={{
              display: "inline-flex",
              padding: "10px 24px",
              borderRadius: "var(--lc-radius-md)",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-medium)" as any,
              textDecoration: "none",
            }}
          >
            Browse Challenges
          </Link>
          <a
            href="https://uat.docs.lightchallenge.app"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              padding: "10px 24px",
              borderRadius: "var(--lc-radius-md)",
              backgroundColor: "transparent",
              color: "var(--lc-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-medium)" as any,
              textDecoration: "none",
              border: "1px solid var(--lc-border)",
            }}
          >
            Read the Docs
          </a>
        </div>
      </section>
    </div>
  );
}
