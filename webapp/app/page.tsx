"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Badge from "./components/ui/Badge";

/* ── Data hooks ────────────────────────────────────────────────────────────── */

type Stats = { totalChallenges: number; validatorStake: string; modelsCount: number };

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setStats(d); })
      .catch(() => {});
  }, []);
  return stats;
}

type ChallengeMeta = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  intent?: string;
  stake?: string;
  category?: string;
  deadline?: string;
  participants_count?: number;
};

function useRecentChallenges() {
  const [challenges, setChallenges] = useState<ChallengeMeta[]>([]);
  useEffect(() => {
    fetch("/api/challenges?limit=6", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.items) setChallenges(d.items.slice(0, 6));
      })
      .catch(() => {});
  }, []);
  return challenges;
}

type Health = { status: string; rpc: boolean; db: boolean; blockNumber: string; blockAge: number };

function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    const poll = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);
  return health;
}

/* ── Formatters ────────────────────────────────────────────────────────────── */

function fmtNumber(n?: number) {
  if (n == null) return "\u2014";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtStake(s?: string) {
  if (!s) return "\u2014";
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function inferCategory(c: ChallengeMeta): string {
  const t = `${c.title || ""} ${c.description || ""} ${c.intent || ""} ${c.category || ""}`.toLowerCase();
  if (/(dota|cs|valorant|league|lol|game|gaming|esport|match|kills|win)/.test(t)) return "Gaming";
  if (/(step|run|fitness|garmin|strava|cycle|hike|walk|apple.*health)/.test(t)) return "Fitness";
  return "Custom";
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  useAccount(); // keep provider hydrated
  const stats = useStats();
  const challenges = useRecentChallenges();
  const health = useHealth();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-16)" }}>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          paddingTop: "var(--lc-space-16)",
          paddingBottom: "var(--lc-space-12)",
          gap: "var(--lc-space-6)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--lc-space-2)",
            padding: "4px 12px",
            borderRadius: "var(--lc-radius-pill)",
            border: "1px solid var(--lc-border)",
            fontSize: "var(--lc-text-caption)",
            color: "var(--lc-text-secondary)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: health?.status === "healthy" ? "var(--lc-success)" : "var(--lc-text-muted)",
            }}
          />
          Lightchain Testnet
        </div>

        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            color: "var(--lc-text)",
            maxWidth: 640,
          }}
        >
          Stake your reputation.{"\n"}
          <span style={{ color: "var(--lc-accent)" }}>Prove it on-chain.</span>
        </h1>

        <p
          style={{
            fontSize: "var(--lc-text-body)",
            color: "var(--lc-text-secondary)",
            lineHeight: "var(--lc-leading-relaxed)" as any,
            maxWidth: 520,
          }}
        >
          Create challenges with real stakes. Submit evidence from fitness trackers
          or gaming platforms. AI verifies your results. Winners get paid.
        </p>

        <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href="/explore"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "12px 24px",
              borderRadius: "var(--lc-radius-md)",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontSize: "var(--lc-text-body)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              textDecoration: "none",
              transition: "background-color var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            Explore Challenges
          </Link>
          <Link
            href="/challenges/create"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "12px 24px",
              borderRadius: "var(--lc-radius-md)",
              border: "1px solid var(--lc-border-strong)",
              color: "var(--lc-text)",
              fontSize: "var(--lc-text-body)",
              fontWeight: "var(--lc-weight-medium)" as any,
              textDecoration: "none",
              backgroundColor: "transparent",
              transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            Create Challenge
          </Link>
        </div>
      </section>

      {/* ── Stats Row ─────────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--lc-space-4)",
        }}
      >
        {[
          { value: fmtNumber(stats?.totalChallenges), label: "Challenges", sub: "Created on-chain" },
          { value: fmtStake(stats?.validatorStake), label: "LCAI Staked", sub: "Total pool value" },
          { value: stats ? String(stats.modelsCount) : "\u2014", label: "AI Models", sub: "Verification models" },
          {
            value: health?.status === "healthy" ? "Live" : health?.status === "degraded" ? "Degraded" : "\u2014",
            label: "Network",
            sub: "Lightchain testnet",
            dot: health?.status === "healthy",
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "var(--lc-space-5)",
              borderRadius: "var(--lc-radius-lg)",
              border: "1px solid var(--lc-border)",
              backgroundColor: "var(--lc-bg-raised)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {s.dot && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--lc-success)" }} />
              )}
              <span
                style={{
                  fontSize: "var(--lc-text-heading)",
                  fontWeight: "var(--lc-weight-bold)" as any,
                  color: "var(--lc-text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.value}
              </span>
            </div>
            <span style={{ fontSize: "var(--lc-text-caption)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {s.label}
            </span>
            <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
              {s.sub}
            </span>
          </div>
        ))}
      </section>

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section>
        <SectionHeading>How it works</SectionHeading>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--lc-space-4)",
          }}
        >
          {[
            {
              step: "01",
              title: "Pick your challenge",
              desc: "Browse open challenges or create your own. Set the goal, stake LCAI, and lock the deadline.",
            },
            {
              step: "02",
              title: "Do the work",
              desc: "Run the miles. Win the match. Hit the target. Your deadline is immutable — the chain doesn't care about excuses.",
            },
            {
              step: "03",
              title: "Prove it, get paid",
              desc: "Submit your evidence. The Lightchain AI network verifies it. Pass the check and claim your reward.",
            },
          ].map((s) => (
            <div
              key={s.step}
              style={{
                padding: "var(--lc-space-6)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--lc-text-title)",
                  fontWeight: "var(--lc-weight-bold)" as any,
                  color: "var(--lc-text-muted)",
                  opacity: 0.3,
                  marginBottom: "var(--lc-space-3)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.step}
              </div>
              <h3
                style={{
                  fontSize: "var(--lc-text-body)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  marginBottom: "var(--lc-space-2)",
                }}
              >
                {s.title}
              </h3>
              <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", lineHeight: "var(--lc-leading-normal)" as any }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Categories ────────────────────────────────────────────── */}
      <section>
        <SectionHeading>Categories</SectionHeading>
        <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
          {[
            { label: "Gaming", desc: "Dota 2, CS2, LoL, Valorant" },
            { label: "Fitness", desc: "Steps, running, cycling" },
            { label: "Esports", desc: "Win streaks, ranked climbs" },
            { label: "Custom", desc: "Anything verifiable" },
          ].map((cat) => (
            <Link
              key={cat.label}
              href={`/explore?category=${cat.label.toLowerCase()}`}
              style={{
                flex: "1 1 140px",
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
                textDecoration: "none",
                textAlign: "center",
                transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
              }}
            >
              <div style={{ fontSize: "var(--lc-text-body)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)", marginBottom: 4 }}>
                {cat.label}
              </div>
              <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                {cat.desc}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Recent Challenges ─────────────────────────────────────── */}
      {challenges.length > 0 && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--lc-space-4)" }}>
            <SectionHeading style={{ marginBottom: 0 }}>Recent Challenges</SectionHeading>
            <Link
              href="/explore"
              style={{
                fontSize: "var(--lc-text-small)",
                color: "var(--lc-text-secondary)",
                textDecoration: "none",
              }}
            >
              View all &rarr;
            </Link>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "var(--lc-space-4)",
            }}
          >
            {challenges.map((c) => (
              <ChallengePreviewCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* ── Quick Links ───────────────────────────────────────────── */}
      <section>
        <SectionHeading>Quick links</SectionHeading>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--lc-space-4)",
          }}
        >
          {[
            { href: "/explore", title: "Explore", desc: "Browse active challenges. Find one worth your stake." },
            { href: "/challenges/create", title: "Create", desc: "Launch a challenge — rules, stake, and deadline." },
            { href: "/me/challenges", title: "My Challenges", desc: "Your active and completed challenges." },
            { href: "/claims", title: "Claims", desc: "Claim your winnings from finalized challenges." },
            { href: "/proofs", title: "Submit Proof", desc: "Upload evidence for AIVM verification." },
            { href: "/settings/linked-accounts", title: "Link Accounts", desc: "Connect Steam, Garmin, Strava, and more." },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
                textDecoration: "none",
                transition: "border-color var(--lc-dur-base) var(--lc-ease)",
              }}
            >
              <div style={{ fontSize: "var(--lc-text-body)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)", marginBottom: 4 }}>
                {item.title}
              </div>
              <div style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", lineHeight: "var(--lc-leading-normal)" as any }}>
                {item.desc}
              </div>
              <div style={{ marginTop: "var(--lc-space-3)", fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                Open &rarr;
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Shared sub-components ─────────────────────────────────────────────────── */

function SectionHeading({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      style={{
        fontSize: "var(--lc-text-caption)",
        fontWeight: "var(--lc-weight-semibold)" as any,
        color: "var(--lc-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: "var(--lc-space-4)",
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

function ChallengePreviewCard({ c }: { c: ChallengeMeta }) {
  const category = inferCategory(c);
  return (
    <Link
      href={`/challenge/${c.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--lc-space-3)",
        padding: "var(--lc-space-5)",
        borderRadius: "var(--lc-radius-lg)",
        border: "1px solid var(--lc-border)",
        backgroundColor: "var(--lc-bg-raised)",
        textDecoration: "none",
        transition: "border-color var(--lc-dur-base) var(--lc-ease)",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Badge variant="category" size="sm">{category}</Badge>
        <Badge
          variant="status"
          status={(c.status as "Active" | "Finalized" | "Canceled") || "Active"}
          dot
          size="sm"
        >
          {c.status || "\u2014"}
        </Badge>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: "var(--lc-text-body)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: "var(--lc-text)",
          lineHeight: "var(--lc-leading-tight)" as any,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as any,
          overflow: "hidden",
        }}
      >
        {c.title || `Challenge #${c.id}`}
      </div>

      {/* Description */}
      {c.description && (
        <p
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-secondary)",
            lineHeight: "var(--lc-leading-normal)" as any,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as any,
            overflow: "hidden",
            margin: 0,
          }}
        >
          {c.description}
        </p>
      )}

      {/* Metrics */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--lc-space-3)",
          fontSize: "var(--lc-text-caption)",
          color: "var(--lc-text-muted)",
        }}
      >
        {c.intent && <span style={{ textTransform: "capitalize" }}>{c.intent.replace(/-/g, " ")}</span>}
        {c.stake && (
          <span>
            <strong style={{ color: "var(--lc-text)", fontWeight: "var(--lc-weight-semibold)" as any }}>{c.stake}</strong> LCAI
          </span>
        )}
      </div>
    </Link>
  );
}
