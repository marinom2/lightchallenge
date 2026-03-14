"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Badge from "./components/ui/Badge";
import {
  Shield,
  Cpu,
  Globe,
  Zap,
  Trophy,
  Heart,
  Gamepad2,
  Mountain,
  ArrowRight,
  Code,
  ExternalLink,
  CheckCircle2,
  Target,
  Sparkles,
  Activity,
} from "lucide-react";

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
  useAccount();
  const stats = useStats();
  const challenges = useRecentChallenges();
  const health = useHealth();

  return (
    <div className="hp">
      {/* ─────────────────────────────── HERO ─────────────────────────────── */}
      <section className="hp-hero">
        {/* Status pill */}
        <div className="hp-hero__pill">
          <span
            className="hp-hero__dot"
            style={{
              backgroundColor: health?.status === "healthy" ? "var(--lc-success)" : "var(--lc-text-muted)",
              boxShadow: health?.status === "healthy" ? "0 0 6px rgba(34,197,94,0.4)" : "none",
            }}
          />
          Lightchain Testnet
        </div>

        {/* Headline */}
        <h1 className="hp-hero__headline">
          Stake your reputation.
          <br />
          <span className="hp-hero__headline-accent">Prove it on-chain.</span>
        </h1>

        {/* Subtext */}
        <p className="hp-hero__sub">
          Create challenges with real stakes. Submit evidence from fitness trackers
          or gaming platforms. AI verifies the results. Winners get paid.
        </p>

        {/* CTA */}
        <div className="hp-hero__cta">
          <Link href="/explore" className="btn btn-primary btn-lg">
            Explore Challenges
          </Link>
          <Link href="/challenges/create" className="btn btn-outline btn-lg">
            Create Challenge
          </Link>
        </div>

        {/* Metrics */}
        <div className="hp-metrics">
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
            <div key={s.label} className="hp-metric">
              <div className="hp-metric__value">
                {s.dot && <span className="hp-metric__live-dot" />}
                {s.value}
              </div>
              <div className="hp-metric__label">{s.label}</div>
              <div className="hp-metric__sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────── TRUST / SOCIAL PROOF ────────────────────── */}
      <section className="hp-section">
        <SectionLabel>Why LightChallenge</SectionLabel>
        <h2 className="hp-section__title">
          Verified results. Real stakes. No trust required.
        </h2>
        <p className="hp-section__sub">
          Every challenge outcome is verified by AI models and recorded immutably on-chain.
          No central authority decides who wins.
        </p>

        <div className="hp-trust-grid">
          <TrustCard
            icon={<Cpu size={20} />}
            title="AI Verification"
            desc="Specialized models analyze your fitness data, match results, or activity logs to verify challenge completion."
          />
          <TrustCard
            icon={<Shield size={20} />}
            title="On-chain Proof"
            desc="Verification results are recorded on Lightchain. Transparent, tamper-proof, and auditable by anyone."
          />
          <TrustCard
            icon={<Globe size={20} />}
            title="Decentralized Validation"
            desc="Lightchain AIVM validators reach consensus on inference results. No single point of failure."
          />
        </div>
      </section>

      {/* ─────────────────────────── HOW IT WORKS ─────────────────────────── */}
      <section className="hp-section">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="hp-section__title">Three steps to victory</h2>

        <div className="hp-steps">
          <StepCard
            step="01"
            icon={<Target size={20} />}
            title="Create a challenge"
            desc="Set the goal, stake LCAI, and lock the deadline. Anyone can join by putting their own stake on the line."
          />
          <StepCard
            step="02"
            icon={<Zap size={20} />}
            title="Do the work"
            desc="Run the miles. Win the match. Hit the target. Your deadline is immutable — the chain doesn't care about excuses."
          />
          <StepCard
            step="03"
            icon={<Trophy size={20} />}
            title="Prove it, get paid"
            desc="Submit evidence. The Lightchain AI network verifies it. Pass the check and claim your reward."
          />
        </div>
      </section>

      {/* ────────────────────── EXPLORE CHALLENGES ────────────────────────── */}
      {challenges.length > 0 && (
        <section className="hp-section">
          <div className="hp-section__header-row">
            <div>
              <SectionLabel>Explore</SectionLabel>
              <h2 className="hp-section__title" style={{ marginBottom: 0 }}>
                Active challenges
              </h2>
            </div>
            <Link href="/explore" className="hp-view-all">
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <div className="hp-challenge-grid">
            {challenges.map((c) => (
              <ChallengePreviewCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────── INTEGRATIONS ─────────────────────────────── */}
      <section className="hp-section">
        <SectionLabel>Integrations</SectionLabel>
        <h2 className="hp-section__title">Connect your platforms</h2>
        <p className="hp-section__sub">
          Link your accounts and we'll pull your data automatically.
          No screenshots. No manual entry.
        </p>

        <div className="hp-integrations">
          <IntegrationCard icon={<Gamepad2 size={24} />} name="Steam" desc="Dota 2, CS2, and more" />
          <IntegrationCard icon={<Activity size={24} />} name="Strava" desc="Running, cycling, swimming" />
          <IntegrationCard icon={<Heart size={24} />} name="Apple Health" desc="Steps, workouts, activity" />
          <IntegrationCard icon={<Mountain size={24} />} name="Garmin" desc="GPS activities and fitness" />
        </div>
      </section>

      {/* ──────────────────────── AI VERIFICATION ─────────────────────────── */}
      <section className="hp-section">
        <div className="hp-aivm">
          <div className="hp-aivm__content">
            <SectionLabel>Powered by Lightchain AIVM</SectionLabel>
            <h2 className="hp-section__title">
              AI that verifies. A network that validates.
            </h2>
            <p className="hp-section__sub" style={{ maxWidth: "none" }}>
              When you submit evidence, a specialized AI model analyzes it and produces a
              verification result. Lightchain AIVM validators independently attest to
              the inference through Proof-of-Intelligence consensus. The result is recorded
              on-chain — transparent and immutable.
            </p>

            <div className="hp-aivm__features">
              <AivmFeature text="Evidence analyzed by specialized AI models" />
              <AivmFeature text="Validator consensus via Proof-of-Intelligence" />
              <AivmFeature text="Results recorded on-chain for full transparency" />
              <AivmFeature text="No human judgment — algorithmic and deterministic" />
            </div>
          </div>
          <div className="hp-aivm__visual">
            <div className="hp-aivm__glyph">
              <Sparkles size={32} />
            </div>
            <div className="hp-aivm__ring hp-aivm__ring--1" />
            <div className="hp-aivm__ring hp-aivm__ring--2" />
            <div className="hp-aivm__ring hp-aivm__ring--3" />
          </div>
        </div>
      </section>

      {/* ──────────────────────────── DEVELOPERS ──────────────────────────── */}
      <section className="hp-section">
        <div className="hp-dev">
          <div className="hp-dev__text">
            <SectionLabel>Developers</SectionLabel>
            <h2 className="hp-section__title">Build on LightChallenge</h2>
            <p className="hp-section__sub" style={{ maxWidth: "none" }}>
              Explore the protocol, integrate AI verification, or build your own challenge types.
              Full documentation and smart contract references available.
            </p>
          </div>
          <div className="hp-dev__actions">
            <a
              href="https://uat.docs.lightchallenge.app"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-lg"
            >
              <Code size={16} />
              Documentation
              <ExternalLink size={12} style={{ opacity: 0.5 }} />
            </a>
          </div>
        </div>
      </section>

      {/* ───────────────────────────── FINAL CTA ──────────────────────────── */}
      <section className="hp-final-cta">
        <h2 className="hp-final-cta__title">
          Ready to prove yourself?
        </h2>
        <p className="hp-final-cta__sub">
          Create a challenge, stake your claim, and let AI be the judge.
        </p>
        <div className="hp-hero__cta">
          <Link href="/challenges/create" className="btn btn-primary btn-lg">
            Create a Challenge <ArrowRight size={16} />
          </Link>
          <Link href="/explore" className="btn btn-ghost btn-lg">
            Browse Challenges
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="hp-section__label">{children}</div>
  );
}

function TrustCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="hp-trust-card">
      <div className="hp-trust-card__icon">{icon}</div>
      <h3 className="hp-trust-card__title">{title}</h3>
      <p className="hp-trust-card__desc">{desc}</p>
    </div>
  );
}

function StepCard({ step, icon, title, desc }: { step: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="hp-step">
      <div className="hp-step__number">{step}</div>
      <div className="hp-step__icon">{icon}</div>
      <h3 className="hp-step__title">{title}</h3>
      <p className="hp-step__desc">{desc}</p>
    </div>
  );
}

function IntegrationCard({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="hp-integration">
      <div className="hp-integration__icon">{icon}</div>
      <div className="hp-integration__name">{name}</div>
      <div className="hp-integration__desc">{desc}</div>
    </div>
  );
}

function AivmFeature({ text }: { text: string }) {
  return (
    <div className="hp-aivm__feature">
      <CheckCircle2 size={16} />
      <span>{text}</span>
    </div>
  );
}

function ChallengePreviewCard({ c }: { c: ChallengeMeta }) {
  const category = inferCategory(c);
  return (
    <Link href={`/challenge/${c.id}`} className="hp-challenge">
      <div className="hp-challenge__top">
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

      <div className="hp-challenge__title">
        {c.title || `Challenge #${c.id}`}
      </div>

      {c.description && (
        <p className="hp-challenge__desc">{c.description}</p>
      )}

      <div className="hp-challenge__meta">
        {c.intent && <span style={{ textTransform: "capitalize" }}>{c.intent.replace(/-/g, " ")}</span>}
        {c.stake && (
          <span>
            <strong>{c.stake}</strong> LCAI
          </span>
        )}
      </div>
    </Link>
  );
}
