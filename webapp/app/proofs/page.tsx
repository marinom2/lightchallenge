// app/proofs/page.tsx
// Submit Proof — challenge-centric board showing proof obligations and lifecycle state.
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck, Clock, CheckCircle, XCircle, Loader2,
  Timer, Bell,
} from "lucide-react";

import ProofChallengeCard, {
  type ProofChallenge,
  getProofGroup,
} from "./components/ProofChallengeCard";
import ConnectWalletGate from "@/app/components/ui/ConnectWalletGate";

/* ── Types ────────────────────────────────────────────────────────── */
type RawChallenge = {
  challenge_id: string;
  subject: string;
  tx_hash: string | null;
  joined_at: string | null;
  created_at: string;
  has_evidence: boolean;
  evidence_submitted_at: string | null;
  evidence_provider: string | null;
  verdict_pass: boolean | null;
  verdict_reasons: string[] | null;
  verdict_evaluator: string | null;
  verdict_updated_at: string | null;
  aivm_verification_status: string | null;
  challenge_status: string | null;
};

type ChallengeMeta = {
  title?: string;
  description?: string;
  category?: string;
  modelHash?: string;
  modelId?: string | null;
  game?: string | null;
  params?: string;
  startsAt?: number | null;
  endsAt?: number | null;
  proofDeadline?: number | null;
};

/* ── Stats row ────────────────────────────────────────────────────── */
function StatBadge({
  value,
  label,
  accent,
  icon,
}: {
  value: number;
  label: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-center px-3 py-2">
      <div className="flex items-center justify-center gap-1.5">
        {icon}
        <span
          className="text-xl font-bold tabular-nums"
          style={accent ? { color: `var(--${accent})` } : undefined}
        >
          {value}
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-widest text-(--text-muted) mt-0.5">
        {label}
      </div>
    </div>
  );
}

/* ── Group section ─────────────────────────────────────────────────── */
function ProofGroupSection({
  title,
  subtitle,
  challenges,
  onSubmitProof,
  onReminder,
}: {
  title: string;
  subtitle: string;
  challenges: ProofChallenge[];
  onSubmitProof: (id: string) => void;
  onReminder?: (id: string) => void;
}) {
  if (!challenges.length) return null;
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
          {title}
        </h2>
        <span className="text-xs font-bold tabular-nums text-(--accent)">
          {challenges.length}
        </span>
      </div>
      <p className="text-xs text-(--text-muted) mb-3">{subtitle}</p>
      <div className="space-y-3">
        {challenges.map((c) => (
          <ProofChallengeCard
            key={c.challenge_id}
            challenge={c}
            onSubmitProof={onSubmitProof}
            onReminder={onReminder}
          />
        ))}
      </div>
    </section>
  );
}

/* ── Reminder modal ───────────────────────────────────────────────── */
function ReminderModal({
  challengeId,
  onClose,
}: {
  challengeId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"proof_window_open" | "proof_closing_soon" | "verification_complete">("proof_window_open");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), challengeId, type }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to save reminder");
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className="panel relative z-10 w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-(--accent)" />
          <h2 className="text-lg font-semibold">Set a reminder</h2>
        </div>
        <p className="text-sm text-(--text-muted)">
          Get notified about Challenge #{challengeId}.
        </p>

        {success ? (
          <div className="text-sm text-(--ok) py-4 text-center">
            Reminder saved. We&apos;ll notify you at <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-1 block">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-1 block">
                Notify when
              </label>
              <select
                className="input w-full"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="proof_window_open">Evidence window opens</option>
                <option value="proof_closing_soon">Evidence deadline approaching</option>
                <option value="verification_complete">Verification complete</option>
              </select>
            </div>
            {error && <div className="text-xs text-(--danger)">{error}</div>}
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
                {submitting ? "Saving…" : "Save reminder"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Main inner component ──────────────────────────────────────────── */
function ProofHomeInner() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [challenges, setChallenges] = useState<ProofChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderChallengeId, setReminderChallengeId] = useState<string | null>(null);

  // Handle legacy ?challengeId= redirect
  useEffect(() => {
    const cid = searchParams.get("challengeId");
    if (cid && /^\d+$/.test(cid)) {
      router.replace(`/proofs/${cid}`);
    }
  }, [searchParams, router]);

  // Fetch challenges
  useEffect(() => {
    if (!address) {
      setChallenges([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch(`/api/me/challenges?subject=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(async (d) => {
        if (!d?.ok) {
          setLoading(false);
          return;
        }
        const raw: RawChallenge[] = d.challenges ?? [];

        // Show all challenges the user has participated in that are active or have data
        const relevant = raw.filter((c) => {
          const cs = c.challenge_status?.toLowerCase() ?? "";
          return (
            ["approved", "paused"].includes(cs) ||
            c.has_evidence ||
            c.verdict_pass != null
          );
        });

        // Enrich with metadata including timeline
        const enriched = await Promise.all(
          relevant.map(async (c): Promise<ProofChallenge> => {
            try {
              const r = await fetch(`/api/challenges/meta/${c.challenge_id}`, { cache: "no-store" });
              const meta: ChallengeMeta = r.ok ? await r.json() : {};
              return {
                ...c,
                title: meta.title,
                category: meta.category,
                modelHash: meta.modelHash,
                modelId: meta.modelId ?? null,
                game: meta.game ?? null,
                evidenceSource: meta.game ?? meta.category ?? null,
                params: meta.params ?? null,
                startsAt: meta.startsAt ?? null,
                endsAt: meta.endsAt ?? null,
                proofDeadline: meta.proofDeadline ?? null,
              };
            } catch {
              return {
                ...c,
                startsAt: null,
                endsAt: null,
                proofDeadline: null,
                evidenceSource: null,
                params: null,
              };
            }
          })
        );

        setChallenges(enriched);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address]);

  // Group challenges
  const groups = useMemo(() => {
    const in_progress: ProofChallenge[] = [];
    const urgent: ProofChallenge[] = [];
    const ready: ProofChallenge[] = [];
    const submitted: ProofChallenge[] = [];
    const verified: ProofChallenge[] = [];
    const failed: ProofChallenge[] = [];

    for (const c of challenges) {
      const g = getProofGroup(c);
      switch (g) {
        case "in_progress":
          in_progress.push(c); break;
        case "urgent": urgent.push(c); break;
        case "ready": ready.push(c); break;
        case "submitted": submitted.push(c); break;
        case "verified": verified.push(c); break;
        case "failed": failed.push(c); break;
      }
    }

    return { in_progress, urgent, ready, submitted, verified, failed };
  }, [challenges]);

  const stats = useMemo(() => ({
    needsProof: groups.urgent.length + groups.ready.length,
    inProgress: groups.in_progress.length,
    submitted: groups.submitted.length,
    passed: groups.verified.length,
    failed: groups.failed.length,
  }), [groups]);

  function handleSubmitProof(challengeId: string) {
    router.push(`/proofs/${challengeId}`);
  }

  const handleReminder = useCallback((challengeId: string) => {
    setReminderChallengeId(challengeId);
  }, []);

  return (
    <div className="stack-6">
      {/* Hero header */}
      <div className="p-6 rounded-lg border bg-raised">
        <div className="row-2 mb-3">
          <ShieldCheck style={{ width: 20, height: 20, color: "var(--lc-accent)" }} />
          <span className="label-text">Submit Proof</span>
        </div>
        <h1 className="page-header__title mb-2">Your proof obligations</h1>
        <p className="text-small color-secondary leading-normal" style={{ maxWidth: "32em" }}>
          Track your active challenges and submit evidence when the proof window opens.
          Evidence is evaluated by the AI pipeline and verified on-chain by the
          Lightchain AIVM network.
        </p>
      </div>
      <div className="rounded-lg border bg-raised overflow-hidden">

        {/* Stats row */}
        {isConnected && !loading && challenges.length > 0 && (
          <div
            className="grid grid-cols-5 divide-x relative z-10"
            style={{
              borderTop: "1px solid var(--lc-border)",
              "--tw-divide-opacity": 1,
            } as React.CSSProperties}
          >
            <StatBadge
              value={stats.inProgress}
              label="In progress"
              icon={stats.inProgress > 0 ? <Timer className="size-3.5 text-(--text-muted)" /> : undefined}
            />
            <StatBadge
              value={stats.needsProof}
              label="Needs proof"
              accent={stats.needsProof > 0 ? "accent" : undefined}
              icon={stats.needsProof > 0 ? <Clock className="size-3.5 text-(--accent)" /> : undefined}
            />
            <StatBadge
              value={stats.submitted}
              label="Submitted"
              icon={stats.submitted > 0 ? <Loader2 className="size-3.5 text-(--text-muted) animate-spin" /> : undefined}
            />
            <StatBadge
              value={stats.passed}
              label="Passed"
              accent={stats.passed > 0 ? "ok" : undefined}
              icon={stats.passed > 0 ? <CheckCircle className="size-3.5 text-(--ok)" /> : undefined}
            />
            <StatBadge
              value={stats.failed}
              label="Failed"
              accent={stats.failed > 0 ? "danger" : undefined}
              icon={stats.failed > 0 ? <XCircle className="size-3.5 text-(--danger)" /> : undefined}
            />
          </div>
        )}
      </div>

      {/* Not connected */}
      {!isConnected && (
        <ConnectWalletGate message="Connect your wallet to see your challenges and proof obligations." />
      )}

      {/* Loading */}
      {isConnected && loading && (
        <div className="panel p-6 text-center">
          <Loader2 className="size-6 mx-auto text-(--text-muted) animate-spin mb-3" />
          <div className="text-sm text-(--text-muted)">Loading your challenges…</div>
        </div>
      )}

      {/* Empty state — improved: don't say "no challenges" */}
      {isConnected && !loading && challenges.length === 0 && (
        <div className="panel p-8 text-center space-y-4">
          <div className="text-lg font-semibold">No proof obligations yet</div>
          <p className="text-sm text-(--text-muted) max-w-md mx-auto">
            Join a challenge to see it here. Once you participate, your proof obligations
            will appear with deadlines and guided submission flows.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/explore" className="btn btn-primary">Browse challenges</Link>
            <Link href="/me/challenges" className="btn btn-ghost">My challenges</Link>
          </div>
        </div>
      )}

      {/* Challenge groups — ordered by lifecycle */}
      {isConnected && !loading && challenges.length > 0 && (
        <div className="space-y-8">
          <ProofGroupSection
            title="Evidence due soon"
            subtitle="These challenges are closing soon — submit proof before the deadline."
            challenges={groups.urgent}
            onSubmitProof={handleSubmitProof}
            onReminder={handleReminder}
          />
          <ProofGroupSection
            title="Evidence window open"
            subtitle="Challenge completed — submit your evidence now."
            challenges={groups.ready}
            onSubmitProof={handleSubmitProof}
            onReminder={handleReminder}
          />
          <ProofGroupSection
            title="In progress — proof later"
            subtitle="These challenges are still running. Evidence will be required after they complete."
            challenges={groups.in_progress}
            onSubmitProof={handleSubmitProof}
            onReminder={handleReminder}
          />
          <ProofGroupSection
            title="Awaiting verification"
            subtitle="Evidence submitted — the AI pipeline is processing your proof."
            challenges={groups.submitted}
            onSubmitProof={handleSubmitProof}
          />
          <ProofGroupSection
            title="Verified"
            subtitle="Proof accepted — these challenges can proceed to finalization."
            challenges={groups.verified}
            onSubmitProof={handleSubmitProof}
          />
          <ProofGroupSection
            title="Did not pass"
            subtitle="Evidence did not meet the challenge requirements."
            challenges={groups.failed}
            onSubmitProof={handleSubmitProof}
          />
        </div>
      )}

      {/* Reminder modal */}
      {reminderChallengeId && (
        <ReminderModal
          challengeId={reminderChallengeId}
          onClose={() => setReminderChallengeId(null)}
        />
      )}
    </div>
  );
}

/* ── Page wrapper ──────────────────────────────────────────────────── */
export default function ValidatorsPage() {
  return (
    <Suspense fallback={
      <div className="p-8 text-center color-muted">Loading…</div>
    }>
      <ProofHomeInner />
    </Suspense>
  );
}
