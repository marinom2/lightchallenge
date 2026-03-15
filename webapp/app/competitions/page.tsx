"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Badge from "@/app/components/ui/Badge";
import Skeleton from "@/app/components/ui/Skeleton";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import EmptyState from "@/app/components/ui/EmptyState";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type CompetitionSummary = {
  id: string;
  title: string;
  type: "challenge" | "bracket" | "league" | "circuit" | "ladder";
  status: "draft" | "registration" | "active" | "completed" | "canceled";
  category: string;
  participant_count: number;
  max_participants: number | null;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  created_at: string;
};

type FilterTab = "all" | "active" | "registration" | "completed";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, "success" | "accent" | "warning" | "danger" | "muted" | "info"> = {
  draft: "muted",
  registration: "info",
  active: "success",
  completed: "accent",
  canceled: "warning",
};

const TYPE_LABELS: Record<string, string> = {
  challenge: "Challenge",
  single: "Challenge",
  bracket: "Bracket",
  league: "League",
  round_robin: "League",
  circuit: "Circuit",
  ladder: "Ladder",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
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

function UsersIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4" /><path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function CompetitionsPage() {
  const { authFetch } = useAuthFetch();
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await authFetch("/api/v1/competitions?limit=20");
        if (!res.ok) throw new Error(`Failed to load competitions (${res.status})`);
        const data = await res.json();
        const list = Array.isArray(data?.competitions) ? data.competitions : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        if (!stop) setCompetitions(list);
      } catch (e: any) {
        if (!stop) setError(e?.message || String(e));
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [authFetch]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return competitions;
    return competitions.filter((c) => c.status === activeFilter);
  }, [competitions, activeFilter]);

  const counts = useMemo(() => ({
    all: competitions.length,
    active: competitions.filter((c) => c.status === "active").length,
    registration: competitions.filter((c) => c.status === "registration").length,
    completed: competitions.filter((c) => c.status === "completed").length,
  }), [competitions]);

  const filterTabs: Tab[] = [
    { id: "all", label: "All", count: counts.all || undefined },
    { id: "active", label: "Active", count: counts.active || undefined },
    { id: "registration", label: "Registration", count: counts.registration || undefined },
    { id: "completed", label: "Completed", count: counts.completed || undefined },
  ];

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
          Competitions
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
          tokens. Browse tournaments or create your own.
        </p>

        <div style={{ display: "flex", gap: "var(--lc-space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/competitions/create"
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
            <PlusIcon />
            Create Tournament
          </Link>
          <Link
            href="/explore"
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
            Explore Challenges
          </Link>
        </div>
      </section>

      {/* ── Filter Tabs ──────────────────────────────────────────────────────── */}
      <Tabs tabs={filterTabs} activeId={activeFilter} onTabChange={(id) => setActiveFilter(id as FilterTab)} />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: "var(--lc-space-2)" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--lc-space-4)" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} variant="card" height="180px" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Failed to load"
            description={error}
            actionLabel="Retry"
            onAction={() => window.location.reload()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={activeFilter === "all" ? "No competitions yet" : `No ${activeFilter} competitions`}
            description={
              activeFilter === "all"
                ? "Be the first to create a competition on the platform."
                : `There are no competitions with "${activeFilter}" status right now.`
            }
            actionLabel={activeFilter === "all" ? "Create Competition" : "Show All"}
            onAction={() => {
              if (activeFilter === "all") {
                window.location.href = "/competitions/create";
              } else {
                setActiveFilter("all");
              }
            }}
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--lc-space-4)" }}>
            {filtered.map((comp) => (
              <Link
                key={comp.id}
                href={`/competitions/${comp.id}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--lc-space-3)",
                  padding: "var(--lc-space-5)",
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  backgroundColor: "var(--lc-bg-raised)",
                  textDecoration: "none",
                  transition: "border-color var(--lc-dur-fast) var(--lc-ease), box-shadow var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                {/* Badge Row */}
                <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap", alignItems: "center" }}>
                  <Badge variant="tone" tone={STATUS_TONE[comp.status] || "muted"} dot size="sm">
                    {comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
                  </Badge>
                  <Badge variant="tone" tone="accent" size="sm">
                    {TYPE_LABELS[comp.type] || comp.type}
                  </Badge>
                  {comp.category && (
                    <Badge variant="category" size="sm">
                      {comp.category}
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <span
                  style={{
                    fontSize: "var(--lc-text-body)",
                    fontWeight: "var(--lc-weight-semibold)" as any,
                    color: "var(--lc-text)",
                    lineHeight: "var(--lc-leading-tight)" as any,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {comp.title}
                </span>

                {/* Meta Row */}
                <div
                  style={{
                    display: "flex",
                    gap: "var(--lc-space-4)",
                    flexWrap: "wrap",
                    marginTop: "auto",
                  }}
                >
                  {/* Participants */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "var(--lc-text-caption)",
                      color: "var(--lc-text-secondary)",
                    }}
                  >
                    <UsersIcon />
                    {comp.participant_count ?? 0}{comp.max_participants ? `/${comp.max_participants}` : ""}
                  </span>

                  {/* Dates */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "var(--lc-text-caption)",
                      color: "var(--lc-text-muted)",
                    }}
                  >
                    <CalendarIcon />
                    {formatDate(comp.starts_at)} &mdash; {formatDate(comp.ends_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

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
          Create a tournament or join one. Prove your skills with AI-verified evidence and earn on-chain achievements.
        </p>
        <div style={{ display: "flex", gap: "var(--lc-space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/competitions/create"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              padding: "10px 24px",
              borderRadius: "var(--lc-radius-md)",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-medium)" as any,
              textDecoration: "none",
            }}
          >
            <PlusIcon />
            Create Tournament
          </Link>
          <Link
            href="/explore"
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
            Browse Challenges
          </Link>
        </div>
      </section>
    </div>
  );
}
