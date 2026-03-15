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

/* ── Icons (lucide-react) ──────────────────────────────────────────────────── */

import { Trophy, Users, Calendar, Plus } from "lucide-react";

function TrophyIcon({ size = 20 }: { size?: number }) {
  return <Trophy size={size} strokeWidth={2} />;
}

function UsersIcon({ size = 14 }: { size?: number }) {
  return <Users size={size} strokeWidth={2} />;
}

function CalendarIcon({ size = 14 }: { size?: number }) {
  return <Calendar size={size} strokeWidth={2} />;
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return <Plus size={size} strokeWidth={2} />;
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
    <div className="stack-8">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="text-center py-8 pb-4" style={{ paddingBottom: "var(--lc-space-4)" }}>
        <div
          className="d-inline-flex row-2 rounded-pill bg-accent-muted color-accent text-caption font-medium mb-4"
          style={{ padding: "4px 12px" }}
        >
          <TrophyIcon size={14} />
          Competitions
        </div>

        <h1 className="text-title font-bold color-primary leading-tight mb-3">
          Verified Competitions.{" "}
          <span className="color-accent">Trustless Prizes.</span>
        </h1>

        <p
          className="text-body color-secondary mx-auto leading-normal mb-6"
          style={{ maxWidth: 560 }}
        >
          On-chain prize escrow, AI-powered evidence verification, and soulbound achievement
          tokens. Browse tournaments or create your own.
        </p>

        <div className="d-flex gap-3 justify-center flex-wrap">
          <Link
            href="/competitions/create"
            className="d-inline-flex row-2 rounded-md text-small font-medium transition-fast"
            style={{
              padding: "10px 20px",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              textDecoration: "none",
            }}
          >
            <PlusIcon />
            Create Tournament
          </Link>
          <Link
            href="/explore"
            className="d-inline-flex row-2 rounded-md text-small font-medium border transition-fast"
            style={{
              padding: "10px 20px",
              backgroundColor: "transparent",
              color: "var(--lc-text)",
              textDecoration: "none",
            }}
          >
            Explore Challenges
          </Link>
        </div>
      </section>

      {/* ── Filter Tabs ──────────────────────────────────────────────────────── */}
      <Tabs tabs={filterTabs} activeId={activeFilter} onTabChange={(id) => setActiveFilter(id as FilterTab)} />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="mt-2">
        {loading ? (
          <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
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
          <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {filtered.map((comp) => (
              <Link
                key={comp.id}
                href={`/competitions/${comp.id}`}
                className="stack-3 p-5 rounded-lg border bg-raised transition-fast"
                style={{ textDecoration: "none" }}
              >
                {/* Badge Row */}
                <div className="row-2 flex-wrap">
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
                  className="text-body font-semibold color-primary leading-tight overflow-hidden"
                  style={{
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {comp.title}
                </span>

                {/* Meta Row */}
                <div className="d-flex gap-4 flex-wrap" style={{ marginTop: "auto" }}>
                  {/* Participants */}
                  <span
                    className="d-inline-flex items-center text-caption color-secondary"
                    style={{ gap: "4px" }}
                  >
                    <UsersIcon />
                    {comp.participant_count ?? 0}{comp.max_participants ? `/${comp.max_participants}` : ""}
                  </span>

                  {/* Dates */}
                  <span
                    className="d-inline-flex items-center text-caption color-muted"
                    style={{ gap: "4px" }}
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
        <h2 className="text-heading font-semibold color-primary mb-4">
          How Competitions Work
        </h2>
        <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            { step: "01", title: "Create or Join", desc: "Pick a challenge and stake your entry. Funds are held in smart contract escrow." },
            { step: "02", title: "Compete & Submit", desc: "Complete the challenge. Upload evidence from fitness trackers or gaming APIs." },
            { step: "03", title: "AI Verifies", desc: "AIVM evaluators process your evidence through Proof-of-Intelligence consensus." },
            { step: "04", title: "Claim Rewards", desc: "Winners claim from the prize pool. Earn soulbound achievement NFTs." },
          ].map((s) => (
            <div
              key={s.step}
              className="stack-3 p-5 rounded-lg border bg-raised"
            >
              <span
                className="text-caption font-bold color-accent"
                style={{ fontFamily: "var(--lc-font-mono)" }}
              >
                {s.step}
              </span>
              <span className="text-small font-semibold color-primary">
                {s.title}
              </span>
              <span className="text-caption color-secondary leading-normal">
                {s.desc}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="text-center p-8 rounded-lg border bg-raised">
        <h2 className="text-heading font-semibold color-primary mb-2">
          Ready to compete?
        </h2>
        <p
          className="text-small color-secondary mx-auto mb-4"
          style={{ maxWidth: 400 }}
        >
          Create a tournament or join one. Prove your skills with AI-verified evidence and earn on-chain achievements.
        </p>
        <div className="d-flex gap-3 justify-center flex-wrap">
          <Link
            href="/competitions/create"
            className="d-inline-flex row-2 rounded-md text-small font-medium"
            style={{
              padding: "10px 24px",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              textDecoration: "none",
            }}
          >
            <PlusIcon />
            Create Tournament
          </Link>
          <Link
            href="/explore"
            className="d-inline-flex rounded-md text-small font-medium border"
            style={{
              padding: "10px 24px",
              backgroundColor: "transparent",
              color: "var(--lc-text)",
              textDecoration: "none",
            }}
          >
            Browse Challenges
          </Link>
        </div>
      </section>
    </div>
  );
}
