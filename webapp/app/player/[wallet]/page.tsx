"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import Badge from "@/app/components/ui/Badge";
import Skeleton from "@/app/components/ui/Skeleton";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import EmptyState from "@/app/components/ui/EmptyState";

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

type ChallengeEntry = {
  challenge_id: string;
  subject: string;
  joined_at: string | null;
  created_at: string;
  challenge_status: string | null;
  verdict_pass: boolean | null;
  verdict_reasons: string[] | null;
  title?: string;
  description?: string;
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type Standing = {
  rank: number;
  address: string;
  points: number;
  wins: number;
  losses: number;
};

type SeasonStanding = Season & {
  standing: Standing | null;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

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

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

/* ── Tab definitions ───────────────────────────────────────────────────────── */

const TABS: Tab[] = [
  { id: "challenges", label: "Challenges" },
  { id: "achievements", label: "Achievements" },
  { id: "seasons", label: "Season Rankings" },
];

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function PlayerProfilePage() {
  const params = useParams();
  const wallet = typeof params.wallet === "string" ? params.wallet : "";

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [challenges, setChallenges] = useState<ChallengeEntry[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<SeasonStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("challenges");
  const [copied, setCopied] = useState(false);

  /* ── Primary data fetch ──────────────────────────────────────────── */

  useEffect(() => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`/api/me/achievements?address=${encodeURIComponent(wallet)}`).then(
        (r) => (r.ok ? r.json() : { achievements: [] }),
      ),
      fetch(`/api/me/reputation?address=${encodeURIComponent(wallet)}`).then(
        (r) => (r.ok ? r.json() : null),
      ),
      fetch(
        `/api/me/challenges?subject=${encodeURIComponent(wallet)}`,
      ).then((r) => (r.ok ? r.json() : { challenges: [] })),
    ])
      .then(([achData, repData, chData]) => {
        setAchievements(achData?.achievements ?? []);
        setReputation(repData);
        setChallenges(chData?.challenges ?? []);
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  /* ── Season rankings fetch (lazy on tab switch) ──────────────────── */

  const fetchSeasons = useCallback(async () => {
    if (!wallet || seasonStandings.length > 0) return;
    setSeasonsLoading(true);
    try {
      const seasonsRes = await fetch("/api/v1/seasons");
      if (!seasonsRes.ok) {
        setSeasonsLoading(false);
        return;
      }
      const seasonsData: Season[] = await seasonsRes.json();
      const results: SeasonStanding[] = await Promise.all(
        seasonsData.map(async (season) => {
          try {
            const standingsRes = await fetch(
              `/api/v1/seasons/${season.id}/standings`,
            );
            if (!standingsRes.ok) return { ...season, standing: null };
            const standings: Standing[] = await standingsRes.json();
            const mine =
              standings.find(
                (s) => s.address.toLowerCase() === wallet.toLowerCase(),
              ) ?? null;
            return { ...season, standing: mine };
          } catch {
            return { ...season, standing: null };
          }
        }),
      );
      setSeasonStandings(results);
    } catch {
      // silently fail
    } finally {
      setSeasonsLoading(false);
    }
  }, [wallet, seasonStandings.length]);

  useEffect(() => {
    if (activeTab === "seasons") {
      fetchSeasons();
    }
  }, [activeTab, fetchSeasons]);

  /* ── Derived stats ───────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const wins = challenges.filter((c) => c.verdict_pass === true).length;
    const losses = challenges.filter((c) => c.verdict_pass === false).length;
    return {
      entered: challenges.length,
      wins,
      losses,
      achievementCount: achievements.length,
    };
  }, [challenges, achievements]);

  const pct = reputation ? progressPercent(reputation.points) : 0;
  const nextLevel = reputation ? nextThreshold(reputation.points) : null;

  const tabsWithCounts: Tab[] = useMemo(
    () =>
      TABS.map((t) => ({
        ...t,
        count:
          t.id === "challenges"
            ? challenges.length
            : t.id === "achievements"
              ? achievements.length
              : seasonStandings.filter((s) => s.standing !== null).length ||
                undefined,
      })),
    [challenges.length, achievements.length, seasonStandings],
  );

  /* ── Copy address ────────────────────────────────────────────────── */

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [wallet]);

  /* ── Render ──────────────────────────────────────────────────────── */

  if (!wallet) {
    return (
      <div style={{ maxWidth: "var(--lc-content-narrow)", margin: "0 auto" }}>
        <Breadcrumb items={[{ label: "Player" }]} />
        <EmptyState
          title="Player not found"
          description="No wallet address was provided."
        />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "var(--lc-content-narrow)",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "var(--lc-space-6)",
      }}
    >
      <Breadcrumb
        items={[
          { label: "Explore", href: "/explore" },
          { label: `Player ${truncateAddress(wallet)}` },
        ]}
      />

      {/* ── Hero Card ──────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "var(--lc-space-6)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-glass-border)",
          background: "var(--lc-glass)",
          backdropFilter: "var(--lc-glass-blur)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--lc-space-4)",
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--lc-space-4)",
            }}
          >
            <Skeleton variant="card" height="100px" />
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "var(--lc-space-3)",
              }}
            >
              {/* Left: avatar + address + level */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--lc-space-4)",
                }}
              >
                {/* Blocky avatar */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    backgroundColor: "var(--lc-accent-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--lc-text-title)",
                    fontWeight: "var(--lc-weight-bold)" as unknown as number,
                    color: "var(--lc-accent)",
                    flexShrink: 0,
                  }}
                >
                  {reputation?.level ?? "?"}
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--lc-space-2)",
                    }}
                  >
                    <button
                      onClick={copyAddress}
                      title="Copy full address"
                      style={{
                        fontSize: "var(--lc-text-heading)",
                        fontWeight:
                          "var(--lc-weight-bold)" as unknown as number,
                        color: "var(--lc-text)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {truncateAddress(wallet)}
                    </button>
                    <span
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
                        opacity: copied ? 1 : 0,
                      }}
                    >
                      Copied!
                    </span>
                  </div>
                  {reputation && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--lc-space-2)",
                        marginTop: "var(--lc-space-1)",
                      }}
                    >
                      <Badge variant="tone" tone="accent" size="sm">
                        Lvl {reputation.level} &middot; {reputation.levelName}
                      </Badge>
                      <span
                        style={{
                          fontSize: "var(--lc-text-caption)",
                          color: "var(--lc-text-muted)",
                        }}
                      >
                        {reputation.points} pts
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {reputation && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    fontSize: "var(--lc-text-caption)",
                    color: "var(--lc-text-muted)",
                  }}
                >
                  <span>{reputation.points} pts</span>
                  {nextLevel && <span>{nextLevel} pts to next level</span>}
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar__fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      {!loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "var(--lc-space-3)",
          }}
        >
          {[
            { label: "Competitions", value: stats.entered },
            { label: "Wins", value: stats.wins },
            { label: "Losses", value: stats.losses },
            { label: "Achievements", value: stats.achievementCount },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: "var(--lc-space-4)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "var(--lc-text-heading)",
                  fontWeight: "var(--lc-weight-bold)" as unknown as number,
                  color: "var(--lc-text)",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "var(--lc-text-caption)",
                  color: "var(--lc-text-muted)",
                  marginTop: 2,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      {!loading && (
        <Tabs
          tabs={tabsWithCounts}
          activeId={activeTab}
          onTabChange={setActiveTab}
          variant="underline"
        />
      )}

      {/* ── Challenges Tab ─────────────────────────────────────────────── */}
      {!loading && activeTab === "challenges" && (
        <>
          {challenges.length === 0 ? (
            <EmptyState
              title="No challenges yet"
              description="This player has not joined any challenges."
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--lc-space-2)",
              }}
            >
              {challenges.map((c) => (
                <Link
                  key={c.challenge_id}
                  href={`/challenge/${c.challenge_id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--lc-space-3)",
                    padding: "var(--lc-space-4)",
                    borderRadius: "var(--lc-radius-lg)",
                    border: "1px solid var(--lc-border)",
                    backgroundColor: "var(--lc-bg-raised)",
                    textDecoration: "none",
                    transition:
                      "border-color var(--lc-dur-fast) var(--lc-ease)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--lc-space-2)",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "var(--lc-text-small)",
                          fontWeight:
                            "var(--lc-weight-medium)" as unknown as number,
                          color: "var(--lc-text)",
                        }}
                      >
                        {c.title ?? `Challenge #${c.challenge_id}`}
                      </span>
                      {c.challenge_status && (
                        <Badge
                          variant="status"
                          status={
                            c.challenge_status as
                              | "Active"
                              | "Finalized"
                              | "Canceled"
                          }
                          size="sm"
                          dot
                        >
                          {c.challenge_status}
                        </Badge>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        marginTop: 2,
                      }}
                    >
                      #{c.challenge_id}
                      {c.joined_at && (
                        <> &middot; Joined {shortDate(c.joined_at)}</>
                      )}
                    </div>
                    {c.verdict_pass !== null && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: "var(--lc-text-caption)",
                          color: c.verdict_pass
                            ? "var(--lc-success)"
                            : "var(--lc-danger)",
                        }}
                      >
                        Verdict: {c.verdict_pass ? "Passed" : "Failed"}
                        {!c.verdict_pass &&
                          c.verdict_reasons?.length &&
                          ` — ${c.verdict_reasons[0]}`}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      color: "var(--lc-text-muted)",
                      fontSize: "var(--lc-text-small)",
                      flexShrink: 0,
                    }}
                  >
                    &rsaquo;
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Achievements Tab ───────────────────────────────────────────── */}
      {!loading && activeTab === "achievements" && (
        <>
          {achievements.length === 0 ? (
            <EmptyState
              title="No achievements yet"
              description="This player hasn't earned any achievement tokens."
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "var(--lc-space-3)",
              }}
            >
              {achievements.map((a) => (
                <Link
                  key={a.token_id}
                  href={`/challenge/${a.challenge_id}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--lc-space-3)",
                    padding: "var(--lc-space-5)",
                    borderRadius: "var(--lc-radius-lg)",
                    border: "1px solid var(--lc-glass-border)",
                    background: "var(--lc-glass)",
                    backdropFilter: "var(--lc-glass-blur)",
                    textDecoration: "none",
                    transition:
                      "border-color var(--lc-dur-fast) var(--lc-ease), transform var(--lc-dur-fast) var(--lc-ease)",
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "var(--lc-radius-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        a.achievement_type === "victory"
                          ? "var(--lc-success-muted)"
                          : "var(--lc-accent-muted)",
                      color:
                        a.achievement_type === "victory"
                          ? "var(--lc-success)"
                          : "var(--lc-accent)",
                      fontSize: "var(--lc-text-heading)",
                    }}
                  >
                    {a.achievement_type === "victory" ? "\u2605" : "\u2713"}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "var(--lc-text-small)",
                        fontWeight:
                          "var(--lc-weight-medium)" as unknown as number,
                        color: "var(--lc-text)",
                      }}
                    >
                      {a.achievement_type === "victory"
                        ? "Victory"
                        : "Completion"}
                      {a.title ? `: ${a.title}` : ` #${a.challenge_id}`}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        marginTop: 4,
                      }}
                    >
                      Token #{a.token_id}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {shortDate(a.minted_at)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Season Rankings Tab ────────────────────────────────────────── */}
      {!loading && activeTab === "seasons" && (
        <>
          {seasonsLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--lc-space-3)",
              }}
            >
              <Skeleton variant="card" height="80px" />
              <Skeleton variant="card" height="80px" />
            </div>
          ) : seasonStandings.length === 0 ? (
            <EmptyState
              title="No seasons available"
              description="Season rankings will appear here when seasons are active."
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--lc-space-3)",
              }}
            >
              {seasonStandings.map((ss) => (
                <div
                  key={ss.id}
                  style={{
                    padding: "var(--lc-space-4) var(--lc-space-5)",
                    borderRadius: "var(--lc-radius-lg)",
                    border: "1px solid var(--lc-border)",
                    backgroundColor: "var(--lc-bg-raised)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "var(--lc-space-3)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "var(--lc-text-small)",
                        fontWeight:
                          "var(--lc-weight-semibold)" as unknown as number,
                        color: "var(--lc-text)",
                      }}
                    >
                      {ss.name}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {shortDate(ss.startDate)} &ndash;{" "}
                      {shortDate(ss.endDate)}
                    </div>
                  </div>
                  {ss.standing ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--lc-space-4)",
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: "var(--lc-text-heading)",
                            fontWeight:
                              "var(--lc-weight-bold)" as unknown as number,
                            color: "var(--lc-accent)",
                          }}
                        >
                          #{ss.standing.rank}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--lc-text-caption)",
                            color: "var(--lc-text-muted)",
                          }}
                        >
                          Rank
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: "var(--lc-text-subhead)",
                            fontWeight:
                              "var(--lc-weight-semibold)" as unknown as number,
                            color: "var(--lc-text)",
                          }}
                        >
                          {ss.standing.points}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--lc-text-caption)",
                            color: "var(--lc-text-muted)",
                          }}
                        >
                          pts
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "var(--lc-text-caption)",
                          color: "var(--lc-text-secondary)",
                        }}
                      >
                        {ss.standing.wins}W / {ss.standing.losses}L
                      </div>
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                      }}
                    >
                      Not ranked
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
