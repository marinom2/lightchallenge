"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

/* ── Live protocol stats ────────────────────────────────────────────────── */
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

/* ── Recent challenges ─────────────────────────────────────────────────── */
type ChallengeMeta = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  intent?: string;
  stake?: string;
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

/* ── Network health ────────────────────────────────────────────────────── */
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

/* ── Types ──────────────────────────────────────────────────────────────── */
type NavItem = { href: string; title: string; desc: string; tag?: string };

const PRIMARY: readonly NavItem[] = [
  { href: "/explore",                   title: "Explore",        desc: "Browse active challenges. Find one worth your stake.",                tag: "Discover" },
  { href: "/challenges/create",         title: "Create",         desc: "Launch a challenge in 4 steps — rules, stake, and deadline.",        tag: "Build" },
  { href: "/me/challenges",             title: "My Challenges",  desc: "Your active, pending, and completed challenges at a glance.",        tag: "Yours" },
  { href: "/claims",                    title: "Claims",         desc: "See and claim your winnings from finalized challenges.",             tag: "Earn" },
  { href: "/proofs",                    title: "Submit Proof",   desc: "Upload evidence for AIVM verification of your goal.",               tag: "Verify" },
  { href: "/settings/linked-accounts",  title: "Link Accounts",  desc: "Connect Steam, Garmin, Strava, and more to enable challenges.",     tag: "Connect" },
] as const;

/* ── Components ─────────────────────────────────────────────────────────── */
function NavCard({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className="nav-card group"
      aria-label={`${item.title}: ${item.desc}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-base font-semibold group-hover:text-(--accent) transition-colors">
          {item.title}
        </span>
        {item.tag && <span className="chip chip--soft shrink-0 text-[10px]">{item.tag}</span>}
      </div>
      <p className="text-sm text-(--text-muted) leading-relaxed">{item.desc}</p>
      <div className="mt-4 text-xs text-(--text-muted) group-hover:text-(--text) transition-colors">
        Open →
      </div>
    </Link>
  );
}

function StatCard({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="metric text-center py-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-widest mt-1">{label}</div>
      <div className="text-[11px] text-(--text-muted) mt-0.5">{hint}</div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
function ChallengePreviewCard({ c }: { c: ChallengeMeta }) {
  const statusColor =
    c.status === "Active" ? "#22c55e" : c.status === "Finalized" ? "#6B5CFF" : "#888";
  return (
    <Link href={`/challenge/${c.id}`} className="panel p-4 group hover:border-(--accent) transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-semibold group-hover:text-(--accent) transition-colors truncate">
          {c.title || `Challenge #${c.id}`}
        </span>
        <span
          className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ background: `${statusColor}22`, color: statusColor }}
        >
          {c.status || "—"}
        </span>
      </div>
      {c.description && (
        <p className="text-xs text-(--text-muted) leading-relaxed line-clamp-2 mb-2">
          {c.description}
        </p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-(--text-muted)">
        {c.intent && <span className="capitalize">{c.intent.replace(/-/g, " ")}</span>}
        {c.stake && <span>{c.stake} LCAI</span>}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { isConnected } = useAccount();
  const stats = useStats();
  const recentChallenges = useRecentChallenges();
  const health = useHealth();

  const fmtChallenges = (n?: number) => {
    if (n == null) return "…";
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  const fmtStake = (s?: string) => {
    if (!s) return "…";
    const n = parseFloat(s);
    if (isNaN(n)) return s;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M LCAI`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k LCAI`;
    return `${n.toFixed(0)} LCAI`;
  };

  return (
    <div className="container-narrow space-y-10">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="panel overflow-hidden relative">
        {/* Ambient gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.4,
            background:
              "radial-gradient(90% 55% at 50% -5%, color-mix(in oklab, var(--grad-1) 55%, transparent), transparent 72%)",
          }}
        />

        <div className="panel-body relative z-10 pt-10 pb-8 sm:pt-14 sm:pb-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-5">
              <span className="chip chip--soft">LightChallenge</span>
              <span className="text-xs text-(--text-muted) tracking-widest uppercase">
                On-chain · AI-verified · Rewarded
              </span>
            </div>

            <h1 className="h1 title-premium leading-[1.1] mb-5">
              Stake your reputation.<br />
              Prove it on-chain.
            </h1>

            <p className="text-base text-(--text-muted) leading-relaxed max-w-xl mb-8">
              LightChallenge lets you put real stake behind real goals.
              Win your match, hit your step count, crush your PR — then submit proof
              and the AI verifier confirms it on-chain. No trust required.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/explore" className="btn btn-primary btn-lg">
                Browse challenges →
              </Link>
              <Link href="/challenges/create" className="btn btn-ghost btn-lg">
                Create one
              </Link>
              {isConnected && (
                <Link href="/me/challenges" className="btn btn-outline btn-lg">
                  My challenges
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Live Stats ───────────────────────────────────────── */}
        <div
          className="relative z-10 grid grid-cols-2 sm:grid-cols-4 divide-x"
          style={{
            borderTop: "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
            "--tw-divide-opacity": 1,
          } as React.CSSProperties}
        >
          <StatCard
            value={fmtChallenges(stats?.totalChallenges)}
            label="Challenges"
            hint="Created on-chain"
          />
          <StatCard
            value={fmtStake(stats?.validatorStake)}
            label="Staked"
            hint="Validator pool"
          />
          <StatCard
            value={stats ? String(stats.modelsCount) : "…"}
            label="Verifiers"
            hint="AI models"
          />
          <StatCard
            value={health ? (health.status === "healthy" ? "Live" : health.status === "degraded" ? "Degraded" : "Down") : "…"}
            label="Network"
            hint="Lightchain testnet"
          />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-4">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              step: "01",
              title: "Pick your challenge",
              desc: "Browse open challenges or create your own. Set the goal, stake LCAI, lock the deadline. It's live on-chain in seconds.",
            },
            {
              step: "02",
              title: "Do the work",
              desc: "Run the miles. Win the match. Hit the target. Your deadline is immutable — the chain doesn't care about excuses.",
            },
            {
              step: "03",
              title: "Prove it, get paid",
              desc: "Submit your evidence. The Lightchain AI network verifies it independently. Pass the check and claim your reward.",
            },
          ].map((s) => (
            <div key={s.step} className="panel p-5">
              <div
                className="text-4xl font-black tabular-nums mb-3"
                style={{ color: "color-mix(in oklab, var(--text-muted) 40%, transparent)" }}
              >
                {s.step}
              </div>
              <div className="text-base font-semibold mb-1.5">{s.title}</div>
              <p className="text-sm text-(--text-muted) leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── USE CASES ───────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-4">
          What people challenge
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Gaming", examples: "Dota 2, CS2, LoL, Valorant", icon: "🎮" },
            { label: "Fitness", examples: "Steps, running, cycling", icon: "🏃" },
            { label: "Esports", examples: "Win streaks, ranked climbs", icon: "🏆" },
            { label: "Custom", examples: "Anything verifiable", icon: "⚡" },
          ].map((uc) => (
            <div key={uc.label} className="panel p-4 text-center">
              <div className="text-2xl mb-2">{uc.icon}</div>
              <div className="text-sm font-semibold mb-1">{uc.label}</div>
              <div className="text-xs text-(--text-muted)">{uc.examples}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── RECENT CHALLENGES ─────────────────────────────────── */}
      {recentChallenges.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
              Recent challenges
            </h2>
            <Link href="/explore" className="text-xs text-(--text-muted) hover:text-(--text) transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentChallenges.map((c) => (
              <ChallengePreviewCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* ── NAV GRID ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-4">
          Explore the app
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRIMARY.map((item) => (
            <NavCard key={item.href} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
