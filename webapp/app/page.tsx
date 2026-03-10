import Link from "next/link";
import type { ReactNode } from "react";

type Metric = {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
};

type NavItem = {
  href: string;
  title: string;
  desc: string;
  icon: string;
  tag?: string;
};

const METRICS: readonly Metric[] = [
  { label: "Active", value: "—", hint: "Challenges live now", icon: "⚡" },
  { label: "Participants", value: "—", hint: "Unique wallets joined", icon: "👥" },
  { label: "Pool", value: "—", hint: "Total stake value", icon: "🏦" },
  { label: "Validators", value: "—", hint: "Available verifiers", icon: "✅" },
] as const;

const PRIMARY: readonly NavItem[] = [
  {
    href: "/challenges/create",
    title: "Create",
    desc: "Guided 4-step builder with approvals, stake, and schedule.",
    icon: "⚡",
    tag: "Builder",
  },
  {
    href: "/explore",
    title: "Explore",
    desc: "Browse challenges across categories and formats.",
    icon: "🔎",
    tag: "Discover",
  },
  {
    href: "/proofs/submit",
    title: "Submit Proof",
    desc: "Attach proof bytes + context and request verification.",
    icon: "🧾",
    tag: "Verify",
  },
  {
    href: "/claims",
    title: "Claims",
    desc: "Claim winner payouts, cashback, and validator rewards.",
    icon: "🏁",
    tag: "Payouts",
  },
  {
    href: "/settings/linked-accounts",
    title: "Linked Accounts",
    desc: "Connect Steam and more to power validator cards.",
    icon: "🎮",
    tag: "Link",
  },
  {
    href: "/dashboard",
    title: "Dashboard",
    desc: "Track approvals, pools, and recent activity.",
    icon: "📊",
    tag: "Track",
  },
] as const;

const QUICK: readonly NavItem[] = [
  {
    href: "/explore",
    title: "Explore challenges",
    desc: "Find something to join or compete in.",
    icon: "🔎",
  },
  {
    href: "/challenges/create",
    title: "Create a challenge",
    desc: "Title, stake, schedule — done in minutes.",
    icon: "⚡",
  },
  {
    href: "/settings/linked-accounts",
    title: "Link Steam",
    desc: "Unlock validator data & game-based challenges.",
    icon: "🎮",
  },
] as const;

export default function HomePage() {
  return (
    <div className="container-narrow space-y-10">
      {/* HERO */}
      <section className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-3 min-w-0">
            <div className="chip chip--soft shrink-0">LightChallenge</div>
            <div className="text-xs tracking-[0.22em] uppercase text-(--text-muted) truncate">
              On-chain settlement • Objective challenges • Validator powered
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="chip">Tip</span>
            <span className="text-sm text-(--text-muted)">
              Simple title, fair stake, short window.
            </span>
          </div>
        </div>

        <div className="panel-body">
          <div className="grid gap-8 md:grid-cols-[1.25fr_.75fr] md:items-start">
            <div className="min-w-0">
              <h1 className="h1 title-premium">
                Create challenges people actually finish.
              </h1>

              <p className="mt-4 text-(--text-muted) leading-relaxed max-w-2xl">
                Create, join, and verify challenges. Stake funds, bring proof (on- or
                off-chain), let validators verify, and claim rewards — finalized on-chain.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/challenges/create" className="btn btn-primary btn-lg">
                  Create Challenge
                </Link>
                <Link href="/explore" className="btn btn-ghost btn-lg">
                  Explore
                </Link>
                <Link href="/dashboard" className="btn btn-outline btn-lg">
                  Dashboard
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="chip chip--soft">Objective-first</span>
                <span className="chip chip--soft">No dead ends</span>
                <span className="chip chip--soft">Clear timelines</span>
              </div>
            </div>

            {/* HERO SIDE: Apple-style “Getting started” */}
            <aside className="u-surface p-5">
              <div className="text-xs uppercase tracking-wider text-(--text-muted)">
                Getting started
              </div>

              <ol className="mt-3 space-y-3">
                <Step
                  n="1"
                  title="Create"
                  desc="Pick a type, stake, and schedule."
                  href="/challenges/create"
                />
                <Step
                  n="2"
                  title="Share"
                  desc="Post the link and let people join."
                  href="/explore"
                />
                <Step
                  n="3"
                  title="Verify"
                  desc="Submit proof and get it approved."
                  href="/proofs/submit"
                />
                <Step
                  n="4"
                  title="Claim"
                  desc="Payouts, cashback, validator rewards."
                  href="/claims"
                />
              </ol>

              <div className="mt-4 text-sm text-(--text-muted) leading-relaxed">
                You’ll always see what’s possible right now — actions that are closed will
                be hidden in the experience, not dumped on you as errors.
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section aria-label="Platform metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRICS.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </section>

      {/* PRIMARY NAV */}
      <section aria-label="Primary navigation" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PRIMARY.map((item) => (
          <NavCard key={item.href} item={item} />
        ))}
      </section>

      {/* QUICK LINKS */}
      <section className="panel">
        <div className="panel-header">
          <div className="min-w-0">
            <div className="h2">Quick Links</div>
            <div className="mt-1 text-sm text-(--text-muted)">
              Jump in fast — clean flows, no clutter.
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="chip">Start here</span>
          </div>
        </div>

        <div className="panel-body">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {QUICK.map((q) => (
              <QuickLinkCard key={q.href} item={q} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------- */
/* Components                         */
/* --------------------------------- */

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-(--text-muted)">
            {metric.label}
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {metric.value}
          </div>
          {metric.hint ? (
            <div className="mt-1 text-xs text-(--text-muted)">{metric.hint}</div>
          ) : null}
        </div>

        {metric.icon ? (
          <div className="metric-ic shrink-0" aria-hidden="true">
            <span className="text-lg leading-none">{metric.icon}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NavCard({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className="panel group p-5 hover:-translate-y-px transition-transform focus:outline-none"
      aria-label={`${item.title}: ${item.desc}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl leading-none" aria-hidden="true">
          {item.icon}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h2">{item.title}</div>
            {item.tag ? <span className="chip chip--soft">{item.tag}</span> : null}
          </div>

          <p className="mt-2 text-(--text-muted) leading-relaxed">{item.desc}</p>

          <div className="mt-5 text-sm text-(--text-muted) group-hover:text-(--text)">
            Open →
          </div>
        </div>
      </div>
    </Link>
  );
}

function QuickLinkCard({ item }: { item: NavItem }) {
  return (
    <Link href={item.href} className="u-surface group p-4">
      <div className="flex items-start gap-3">
        <div className="text-lg leading-none" aria-hidden="true">
          {item.icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{item.title}</div>
          <div className="mt-1 text-sm text-(--text-muted)">{item.desc}</div>
          <div className="mt-3 text-sm text-(--text-muted) group-hover:text-(--text)">
            Open →
          </div>
        </div>
      </div>
    </Link>
  );
}

function Step({
  n,
  title,
  desc,
  href,
}: {
  n: string;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="badge-id badge-id--sm shrink-0" aria-hidden="true">
        {n}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={href} className="link-soft font-semibold">
            {title}
          </Link>
        </div>
        <div className="text-sm text-(--text-muted) leading-relaxed">{desc}</div>
      </div>
    </li>
  );
}

/* Utility: tabular numbers */
function tabularNums(children: ReactNode) {
  return <span className="tabular-nums">{children}</span>;
}