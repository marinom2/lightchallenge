"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  Shield,
  Zap,
  Trophy,
  ArrowRight,
  CheckCircle2,
  Target,
  Users,
  Gamepad2,
} from "lucide-react";
import CompetitiveOrbit from "./components/CompetitiveOrbit";

/* ── Data hooks ────────────────────────────────────────────────────────────── */

type Health = {
  status: string;
  rpc: boolean;
  db: boolean;
  blockNumber: string;
  blockAge: number;
};

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

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  useAccount();
  const health = useHealth();

  return (
    <div className="hp">
      {/* ═══════════════════════════════ HERO ═══════════════════════════════ */}
      <section className="hp-hero">
        <div className="hp-hero__content">
          {/* Eyebrow */}
          <div className="hp-hero__eyebrow">
            {health?.status === "healthy" && (
              <span className="hp-hero__live-dot" />
            )}
            Verified competition infrastructure
          </div>

          {/* Headline */}
          <h1 className="hp-hero__headline">
            Enter the arena for{" "}
            <span className="hp-hero__headline-accent">
              modern challenges.
            </span>
          </h1>

          {/* Supporting copy */}
          <p className="hp-hero__sub">
            Launch and join structured challenges across Dota&nbsp;2, CS2,
            League of Legends, and Valorant&nbsp;&mdash; built for players,
            teams, and tournament organizers who want competition to feel real.
          </p>

          {/* CTAs */}
          <div className="hp-hero__cta">
            <Link href="/explore" className="btn btn-primary btn-lg">
              Explore Challenges <ArrowRight size={16} />
            </Link>
            <Link href="/explore" className="btn btn-outline btn-lg">
              For Teams &amp; Tournaments
            </Link>
          </div>

          {/* Trust chips */}
          <div className="hp-hero__trust">
            <TrustChip>Verified rules</TrustChip>
            <TrustChip>Competitive formats</TrustChip>
            <TrustChip>Team-ready</TrustChip>
          </div>
        </div>

        {/* Animated orbit visual */}
        <div className="hp-hero__visual">
          <CompetitiveOrbit />
        </div>
      </section>

      {/* ═════════════════════════ ARENA RAIL ═══════════════════════════════ */}
      <div className="hp-rail">
        <RailStep icon={<Target size={14} />} label="Launch" />
        <div className="hp-rail__line" />
        <RailStep icon={<Zap size={14} />} label="Compete" />
        <div className="hp-rail__line" />
        <RailStep icon={<Trophy size={14} />} label="Verify" />
      </div>

      {/* ═════════════════════ ENTRY PATHS ══════════════════════════════════ */}
      <section className="hp-section">
        <div className="hp-paths">
          <Link href="/explore" className="hp-path">
            <div className="hp-path__icon">
              <Gamepad2 size={20} />
            </div>
            <h3 className="hp-path__title">For Players</h3>
            <p className="hp-path__desc">
              Join public or private challenges, compete in your game, submit
              proof, and claim your reward.
            </p>
            <span className="hp-path__link">
              Browse Challenges <ArrowRight size={14} />
            </span>
          </Link>
          <Link href="/explore" className="hp-path">
            <div className="hp-path__icon">
              <Users size={20} />
            </div>
            <h3 className="hp-path__title">For Teams &amp; Organizers</h3>
            <p className="hp-path__desc">
              Run structured competitions, manage private events, and
              orchestrate tournament flows for your community.
            </p>
            <span className="hp-path__link">
              Team Features <ArrowRight size={14} />
            </span>
          </Link>
        </div>
      </section>

      {/* ═══════════════════ HOW IT WORKS ═══════════════════════════════════ */}
      <section className="hp-section">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="hp-section__title">
          Three steps to verified competition
        </h2>
        <p className="hp-section__sub">
          Every challenge follows the same structured flow&nbsp;&mdash; from
          creation to verified outcome.
        </p>

        <div className="hp-steps">
          <StepCard
            step="01"
            icon={<Target size={20} />}
            title="Launch"
            desc="Create a challenge with structured rules, stake LCAI, and lock the deadline. The contract is immutable — no take-backs."
          />
          <StepCard
            step="02"
            icon={<Zap size={20} />}
            title="Compete"
            desc="Players join by staking, then compete in their game or complete their goal before the deadline hits."
          />
          <StepCard
            step="03"
            icon={<Trophy size={20} />}
            title="Verify & Earn"
            desc="Submit evidence. AI models on Lightchain verify the result. Winners claim their reward automatically on-chain."
          />
        </div>
      </section>

      {/* ═══════════════════ VERIFICATION ═══════════════════════════════════ */}
      <section className="hp-section">
        <div className="hp-verify">
          <div className="hp-verify__content">
            <SectionLabel>Powered by Lightchain AIVM</SectionLabel>
            <h2 className="hp-section__title">
              AI-verified outcomes. On-chain proof.
            </h2>
            <p className="hp-section__sub" style={{ maxWidth: "none" }}>
              Every challenge result is analyzed by specialized AI models and
              validated through Lightchain&rsquo;s Proof-of-Intelligence
              consensus. No human judgment. No disputes. Just verified outcomes
              recorded permanently on-chain.
            </p>
            <div className="hp-verify__signals">
              <VerifySignal text="AI-powered evidence analysis" />
              <VerifySignal text="Validator consensus on results" />
              <VerifySignal text="Immutable on-chain record" />
              <VerifySignal text="Automated payout execution" />
            </div>
          </div>
          <div className="hp-verify__visual">
            <div className="hp-verify__glyph">
              <Shield size={28} />
            </div>
            <div className="hp-verify__ring hp-verify__ring--1" />
            <div className="hp-verify__ring hp-verify__ring--2" />
            <div className="hp-verify__ring hp-verify__ring--3" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FINAL CTA ══════════════════════════════════ */}
      <section className="hp-final-cta">
        <h2 className="hp-final-cta__title">Ready to compete?</h2>
        <p className="hp-final-cta__sub">
          Enter the arena. Create or join a challenge and let AI be the judge.
        </p>
        <div className="hp-hero__cta" style={{ justifyContent: "center" }}>
          <Link href="/explore" className="btn btn-primary btn-lg">
            Explore Challenges <ArrowRight size={16} />
          </Link>
          <Link href="/challenges/create" className="btn btn-ghost btn-lg">
            Create a Challenge
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="hp-section__label">{children}</div>;
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="hp-hero__chip">
      <CheckCircle2 size={12} />
      {children}
    </span>
  );
}

function RailStep({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="hp-rail__step">
      <span className="hp-rail__icon">{icon}</span>
      <span className="hp-rail__label">{label}</span>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  desc,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="hp-step">
      <div className="hp-step__number">{step}</div>
      <div className="hp-step__icon">{icon}</div>
      <h3 className="hp-step__title">{title}</h3>
      <p className="hp-step__desc">{desc}</p>
    </div>
  );
}

function VerifySignal({ text }: { text: string }) {
  return (
    <div className="hp-verify__signal">
      <CheckCircle2 size={16} />
      <span>{text}</span>
    </div>
  );
}
