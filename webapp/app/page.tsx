"use client";

import Link from "next/link";
import Image from "next/image";
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
import ScrollCanvas from "./components/ScrollCanvas";

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

/* ── Brand logos ───────────────────────────────────────────────────────────── */

const BRANDS = [
  { name: "Dota 2", src: "/brands/dota_vector.png", w: 80, h: 80 },
  { name: "CS2", src: "/brands/cs-2-logo.png", w: 80, h: 80 },
  { name: "Valorant", src: "/brands/valorant_vector.jpg", w: 80, h: 80 },
  { name: "Strava", src: "/brands/brand-strava_vector.svg", w: 80, h: 80 },
  { name: "Apple Health", src: "/brands/apple_vector.svg", w: 80, h: 80 },
  { name: "Garmin", src: "/brands/garmin_vector.png", w: 80, h: 80 },
];

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  useAccount();
  const health = useHealth();

  return (
    <div className="hp">
      {/* ═══════════════════ ORBIT HERO — scroll-driven ═══════════════════ */}
      <section className="hp-scroll-hero">
        <ScrollCanvas
          framePath="/frames/orbit/frame_"
          frameCount={192}
          width={1280}
          height={720}
          scrollSpan={4}
          className="hp-scroll-hero__canvas"
        />

        {/* Overlay content — pinned on top of the sticky canvas */}
        <div className="hp-scroll-hero__overlay">
          <div className="hp-scroll-hero__content">
            <div className="hp-hero__eyebrow">
              {health?.status === "healthy" && (
                <span className="hp-hero__live-dot" />
              )}
              Verified competition infrastructure
            </div>

            <h1 className="hp-hero__headline">
              Enter the arena for{" "}
              <span className="hp-hero__headline-accent">
                modern challenges.
              </span>
            </h1>

            <p className="hp-hero__sub">
              Launch and join structured challenges across Dota&nbsp;2, CS2,
              League of Legends, and Valorant&nbsp;&mdash; built for players,
              teams, and tournament organizers who want competition to feel real.
            </p>

            <div className="hp-hero__cta">
              <Link href="/explore" className="btn btn-primary btn-lg">
                Explore Challenges <ArrowRight size={16} />
              </Link>
              <Link href="/explore" className="btn btn-outline btn-lg">
                For Teams &amp; Tournaments
              </Link>
            </div>

            <div className="hp-hero__trust">
              <TrustChip>Verified rules</TrustChip>
              <TrustChip>Competitive formats</TrustChip>
              <TrustChip>Team-ready</TrustChip>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════ ARENA RAIL ═════════════════════════════════ */}
      <div className="hp-rail">
        <RailStep icon={<Target size={14} />} label="Launch" />
        <div className="hp-rail__line" />
        <RailStep icon={<Zap size={14} />} label="Compete" />
        <div className="hp-rail__line" />
        <RailStep icon={<Trophy size={14} />} label="Verify" />
      </div>

      {/* ═════════════════════ BRAND LOGOS ════════════════════════════════ */}
      <section className="hp-brands">
        <p className="hp-brands__label">Supported platforms</p>
        <div className="hp-brands__row">
          {BRANDS.map((b) => (
            <div key={b.name} className="hp-brands__item">
              <Image
                src={b.src}
                alt={b.name}
                width={b.w}
                height={b.h}
                className="hp-brands__logo"
              />
              <span className="hp-brands__name">{b.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════════════ ENTRY PATHS ════════════════════════════════ */}
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

      {/* ═══════════════════ HOW IT WORKS ═════════════════════════════════ */}
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

      {/* ═══════════════ VERIFICATION — scroll-driven logo ═══════════════ */}
      <section className="hp-scroll-verify">
        <ScrollCanvas
          framePath="/frames/logo/frame_"
          frameCount={144}
          width={960}
          height={960}
          scrollSpan={3}
          className="hp-scroll-verify__canvas"
        />

        <div className="hp-scroll-verify__overlay">
          <div className="hp-scroll-verify__content">
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
        </div>
      </section>

      {/* ═══════════════════════ FINAL CTA ════════════════════════════════ */}
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
