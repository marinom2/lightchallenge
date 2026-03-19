"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  ArrowRight,
  Zap,
  Shield,
  Trophy,
  Gamepad2,
  Heart,
  Users,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { useTokenPrice } from "@/lib/useTokenPrice";
import { formatLCAIAsUSD } from "@/lib/tokenPrice";
import {
  AppleIcon,
  GarminIcon,
  DotaIcon,
  CS2Icon,
} from "./components/icons/BrandIcons";

/* ── Data hooks ────────────────────────────────────────────────────────────── */

type Stats = {
  totalChallenges: number;
  validatorStake: string;
  modelsCount: number;
};

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setStats(d);
      })
      .catch(() => {});
  }, []);
  return stats;
}

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

/* ── Formatters ────────────────────────────────────────────────────────────── */

function fmtNumber(n?: number) {
  if (n == null) return "\u2014";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ── Animation variants ───────────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const cardReveal = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const },
  },
};

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  useAccount();
  const stats = useStats();
  const health = useHealth();
  const tokenPrice = useTokenPrice();

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <div className="hp">
      {/* ═══════════════════════════════ HERO ═══════════════════════════════ */}
      <section className="hp-hero" ref={heroRef}>
        <motion.div
          className="hp-hero__inner"
          style={{ scale: heroScale, opacity: heroOpacity, y: heroY }}
        >
          {/* Video centerpiece */}
          <div className="hp-hero__video-wrap">
            <video
              className="hp-hero__video"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              poster="/art/background_no_text.webp"
            >
              <source src="/video/hero.mp4" type="video/mp4" />
            </video>
            <div className="hp-hero__video-glow" />
          </div>

          {/* Copy overlay */}
          <div className="hp-hero__copy">
            <motion.div
              className="hp-hero__pill"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <span className="hp-hero__pill-dot" />
              One system. Gaming + Fitness.
            </motion.div>

            <motion.h1
              className="hp-hero__headline"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.7 }}
            >
              Compete. Verify.{" "}
              <span className="hp-hero__headline-accent">Earn.</span>
            </motion.h1>

            <motion.p
              className="hp-hero__sub"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
            >
              Turn real activity and gameplay into verified rewards
              through one structured competition system.
            </motion.p>

            <motion.div
              className="hp-hero__cta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.6 }}
            >
              <Link href="/explore" className="btn btn-primary btn-lg">
                Explore Challenges <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className="btn btn-outline btn-lg">
                How It Works
              </a>
            </motion.div>
          </div>

          {/* Platform indicators */}
          <motion.div
            className="hp-hero__platforms"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.8 }}
          >
            <PlatformPill icon={<AppleIcon size={14} />} label="Apple Health" />
            <PlatformPill icon={<GarminIcon size={14} />} label="Garmin" />
            <PlatformPill icon={<DotaIcon size={14} />} label="Dota 2" />
            <PlatformPill icon={<CS2Icon size={14} />} label="Counter-Strike" />
            <PlatformPill icon={<ValorantMark size={14} />} label="Valorant" />
          </motion.div>
        </motion.div>

        {/* Metrics bar */}
        <motion.div
          className="hp-metrics"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.7 }}
        >
          <MetricCell
            value={fmtNumber(stats?.totalChallenges)}
            label="Challenges"
          />
          <MetricCell
            value={
              stats?.validatorStake
                ? formatLCAIAsUSD(
                    parseFloat(stats.validatorStake),
                    tokenPrice
                  )
                : "\u2014"
            }
            label="Total Staked"
          />
          <MetricCell
            value={stats ? String(stats.modelsCount) : "\u2014"}
            label="AI Verifiers"
          />
          <MetricCell
            value={
              health?.status === "healthy"
                ? "Live"
                : health?.status === "degraded"
                  ? "Degraded"
                  : "\u2014"
            }
            label="Network"
            dot={health?.status === "healthy"}
          />
        </motion.div>
      </section>

      {/* ═════════════════════════ HOW IT WORKS ═════════════════════════════ */}
      <ScrollSection id="how-it-works">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="hp-section__title">
          Three steps to verified rewards
        </h2>
        <p className="hp-section__sub">
          Pick a challenge, complete the work, and let the system handle the rest.
        </p>

        <motion.div
          className="hp-steps"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <StepCard
            step="01"
            icon={<Zap size={20} />}
            title="Do the work"
            desc="Run the miles. Win the match. Hit the target. Pick your challenge, stake LCAI, and get it done before the deadline."
          />
          <StepCard
            step="02"
            icon={<Shield size={20} />}
            title="We verify it"
            desc="Submit your evidence. AI models on the Lightchain network analyze your data and produce a tamper-proof verification result."
          />
          <StepCard
            step="03"
            icon={<Trophy size={20} />}
            title="You get rewarded"
            desc="Pass verification and your reward is unlocked on-chain. No middlemen, no disputes, no trust required."
          />
        </motion.div>
      </ScrollSection>

      {/* ═══════════════════════ ECOSYSTEM ══════════════════════════════════ */}
      <ScrollSection>
        <SectionLabel>Ecosystem</SectionLabel>
        <h2 className="hp-section__title">
          One platform. Every competition.
        </h2>
        <p className="hp-section__sub">
          Gaming and fitness challenges run through the same verification
          infrastructure, the same staking model, the same payout logic.
        </p>

        <motion.div
          className="hp-ecosystem"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <EcosystemCard
            icon={<Gamepad2 size={22} />}
            title="Gaming"
            desc="Dota 2, Counter-Strike, Valorant. Win conditions verified through match data and replay analysis."
            accent="blue"
          />
          <EcosystemCard
            icon={<Heart size={22} />}
            title="Fitness"
            desc="Steps, runs, cycling, workouts. Activity verified through Apple Health, Garmin, and connected devices."
            accent="green"
          />
          <EcosystemCard
            icon={<Users size={22} />}
            title="Teams & Tournaments"
            desc="Group challenges, head-to-head matchups, and multi-round tournaments with pooled stakes."
            accent="purple"
          />
          <EcosystemCard
            icon={<Sparkles size={22} />}
            title="Unified System"
            desc="Same smart contracts, same AI verification, same on-chain settlement. One ecosystem for all challenge types."
            accent="gold"
          />
        </motion.div>
      </ScrollSection>

      {/* ═════════════════════ TRUST / PROOF ════════════════════════════════ */}
      <ScrollSection>
        <div className="hp-proof">
          <motion.div
            className="hp-proof__content"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <SectionLabel>Built on proof</SectionLabel>
            <h2 className="hp-section__title">
              Structured challenges. Verified progress. Automated payouts.
            </h2>
            <p className="hp-section__sub" style={{ maxWidth: "none" }}>
              Every challenge has immutable rules, a locked deadline, and
              AI-powered verification. Results are written on-chain and
              payouts execute automatically. No human judgment. No appeals.
            </p>

            <div className="hp-proof__features">
              <ProofFeature text="Challenge rules locked at creation" />
              <ProofFeature text="Evidence analyzed by specialized AI models" />
              <ProofFeature text="Validator consensus via Proof-of-Intelligence" />
              <ProofFeature text="Results immutable on Lightchain" />
              <ProofFeature text="Payouts execute automatically on verification" />
            </div>
          </motion.div>

          <motion.div
            className="hp-proof__visual"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="hp-proof__glyph">
              <Shield size={28} />
            </div>
            <div className="hp-proof__ring hp-proof__ring--1" />
            <div className="hp-proof__ring hp-proof__ring--2" />
            <div className="hp-proof__ring hp-proof__ring--3" />
          </motion.div>
        </div>
      </ScrollSection>

      {/* ═══════════════════════ FINAL CTA ══════════════════════════════════ */}
      <ScrollSection>
        <div className="hp-final-cta">
          <motion.h2
            className="hp-final-cta__title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            Ready to prove yourself?
          </motion.h2>
          <motion.p
            className="hp-final-cta__sub"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.7 }}
          >
            Create a challenge, stake your claim, and let AI be the judge.
          </motion.p>
          <motion.div
            className="hp-hero__cta"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <Link href="/challenges/create" className="btn btn-primary btn-lg">
              Create a Challenge <ArrowRight size={16} />
            </Link>
            <Link href="/explore" className="btn btn-ghost btn-lg">
              Browse Challenges
            </Link>
          </motion.div>
        </div>
      </ScrollSection>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function ScrollSection({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.section
      ref={ref}
      id={id}
      className="hp-section"
      initial={{ opacity: 0, y: 48 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="hp-section__label">{children}</div>;
}

function PlatformPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="hp-platform-pill">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function MetricCell({
  value,
  label,
  dot,
}: {
  value: string;
  label: string;
  dot?: boolean;
}) {
  return (
    <div className="hp-metric">
      <div className="hp-metric__value">
        {dot && <span className="hp-metric__live-dot" />}
        {value}
      </div>
      <div className="hp-metric__label">{label}</div>
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
    <motion.div className="hp-step" variants={cardReveal}>
      <div className="hp-step__number">{step}</div>
      <div className="hp-step__icon">{icon}</div>
      <h3 className="hp-step__title">{title}</h3>
      <p className="hp-step__desc">{desc}</p>
    </motion.div>
  );
}

function EcosystemCard({
  icon,
  title,
  desc,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: "blue" | "green" | "purple" | "gold";
}) {
  return (
    <motion.div
      className={`hp-eco-card hp-eco-card--${accent}`}
      variants={cardReveal}
    >
      <div className="hp-eco-card__icon">{icon}</div>
      <h3 className="hp-eco-card__title">{title}</h3>
      <p className="hp-eco-card__desc">{desc}</p>
    </motion.div>
  );
}

function ProofFeature({ text }: { text: string }) {
  return (
    <div className="hp-proof__feature">
      <CheckCircle2 size={16} />
      <span>{text}</span>
    </div>
  );
}

function ValorantMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2.2 4.2L13.1 19.8H8L2.2 11.6V4.2ZM12.5 4.2L21.8 17.5V19.8H17.5L12.5 12.7V4.2Z" />
    </svg>
  );
}
