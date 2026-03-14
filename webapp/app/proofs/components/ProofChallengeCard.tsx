// app/proofs/components/ProofChallengeCard.tsx
"use client";

import Link from "next/link";
import { Clock, Trophy, AlertTriangle, CheckCircle, Loader2, XCircle, Zap, Timer, CalendarClock, Bell } from "lucide-react";
import { detectSource, computePrimaryAction } from "@/lib/verificationCapability";
import {
  resolveLifecycle,
  toValidatorGroup,
  type LifecycleInput,
  type ValidatorGroup,
} from "@/lib/challenges/lifecycle";

export type ProofChallenge = {
  challenge_id: string;
  title?: string;
  category?: string;
  challenge_status: string | null;
  has_evidence: boolean;
  evidence_submitted_at: string | null;
  evidence_provider: string | null;
  verdict_pass: boolean | null;
  verdict_reasons: string[] | null;
  verdict_updated_at: string | null;
  aivm_verification_status: string | null;
  joined_at: string | null;
  created_at: string;
  modelHash?: string | null;
  modelId?: string | null;
  chain_outcome?: number | null;
  // Enriched from meta
  startsAt?: number | null;
  endsAt?: number | null;
  proofDeadline?: number | null;
  evidenceSource?: string | null;
  game?: string | null;
  params?: any | null;
};

export type ProofGroup = ValidatorGroup;

/* ── Helpers ────────────────────────────────────────────────────────── */
function timeLeft(deadline: number | null | undefined): string | null {
  if (!deadline) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Ended";
  if (diff < 3600) return `${Math.ceil(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d left`;
  return `${Math.floor(diff / 604800)}w left`;
}

function timeUntil(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = ts - now;
  if (diff <= 0) return null;
  if (diff < 3600) return `in ${Math.ceil(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `in ${Math.floor(diff / 86400)}d`;
  return `in ${Math.floor(diff / 604800)}w`;
}

function toInput(c: ProofChallenge): LifecycleInput {
  return {
    challenge_id: c.challenge_id,
    challenge_status: c.challenge_status,
    endsAt: c.endsAt,
    proofDeadline: c.proofDeadline,
    has_evidence: c.has_evidence,
    evidence_submitted_at: c.evidence_submitted_at,
    evidence_provider: c.evidence_provider,
    verdict_pass: c.verdict_pass,
    verdict_reasons: c.verdict_reasons,
    aivm_verification_status: c.aivm_verification_status,
    chainOutcome: c.chain_outcome ?? null,
  };
}

/**
 * Resolve proof group using the canonical lifecycle resolver.
 * Exported for use by the validators page grouping logic.
 */
export function getProofGroup(c: ProofChallenge): ProofGroup {
  const lc = resolveLifecycle(toInput(c));
  return toValidatorGroup(lc);
}

/* ── Source badge ────────────────────────────────────────────────────── */
function SourceBadge({ icon, name, mode }: { icon: string; name: string; mode: string }) {
  const modeLabel =
    mode === "mobile_upload" ? "mobile" :
    mode === "file_upload" ? "upload" :
    mode === "account_required" ? "account req." :
    mode === "unsupported" ? "unsupported" : "";
  return (
    <span className="vce-source-badge">
      <span>{icon}</span>
      <span>{name}</span>
      {modeLabel && <span className="vce-source-badge__mode">{modeLabel}</span>}
    </span>
  );
}

/* ── Card Component ─────────────────────────────────────────────────── */
export default function ProofChallengeCard({
  challenge,
  onSubmitProof,
  onReminder,
}: {
  challenge: ProofChallenge;
  onSubmitProof?: (challengeId: string) => void;
  onReminder?: (challengeId: string) => void;
}) {
  const group = getProofGroup(challenge);
  const tl = timeLeft(challenge.proofDeadline);
  const isUrgent = group === "urgent";
  const isEnded = tl === "Ended";
  const endCountdown = timeUntil(challenge.endsAt);
  const proofOpensIn = challenge.endsAt ? timeUntil(challenge.endsAt) : null;

  // Derive source info via VCE
  const source = detectSource({
    modelHash: challenge.modelHash,
    modelId: challenge.modelId,
    category: challenge.category,
    game: challenge.game ?? challenge.evidenceSource,
  });

  const action = computePrimaryAction(source, false);
  const ctaLabel =
    group === "failed" ? "Retry →" :
    action === "show_qr" ? "Continue on mobile →" :
    action === "upload_file" ? `Upload ${source.name} data →` :
    action === "connect_steam" ? "Connect Steam →" :
    action === "connect_riot" ? "Connect Riot →" :
    action === "submit_match" ? "Submit match →" :
    "Submit proof →";

  const borderStatus =
    group === "in_progress" ? "progress" :
    group === "urgent" ? "action" :
    group === "ready" ? "action" :
    group === "submitted" ? "progress" :
    group === "verified" ? "ok" : "bad";

  return (
    <div
      className="proof-challenge-card challenge-card p-0"
      data-status={borderStatus}
      data-urgent={isUrgent || undefined}
    >
      <div className="p-5 pl-6">
        {/* Top row: icon + title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="text-xl mt-0.5 shrink-0">{source.icon}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold leading-tight">
                  {challenge.title ?? `Challenge #${challenge.challenge_id}`}
                </span>
                <SourceBadge icon={source.icon} name={source.name} mode={source.mode} />
              </div>
              {challenge.title && (
                <div className="text-xs text-(--text-muted) mt-0.5">#{challenge.challenge_id}</div>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className="shrink-0">
            {group === "in_progress" && (
              <span className="chip chip--info flex items-center gap-1">
                <Timer className="size-3" /> In progress
              </span>
            )}
            {group === "urgent" && (
              <span className="chip chip--warn flex items-center gap-1">
                <Clock className="size-3" /> Ending soon
              </span>
            )}
            {group === "ready" && (
              <span className="chip chip--action flex items-center gap-1">
                <Zap className="size-3" /> Ready
              </span>
            )}
            {group === "submitted" && (
              <span className="chip chip--info flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Verifying
              </span>
            )}
            {group === "verified" && (
              <span className="chip chip--ok flex items-center gap-1">
                <CheckCircle className="size-3" /> Passed
              </span>
            )}
            {group === "failed" && (
              <span className="chip chip--bad flex items-center gap-1">
                <XCircle className="size-3" /> Failed
              </span>
            )}
          </div>
        </div>

        {/* Info row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--text-muted)">
          {/* In progress: show when challenge ends */}
          {group === "in_progress" && endCountdown && (
            <span className="flex items-center gap-1">
              <Timer className="size-3" /> Challenge ends {endCountdown}
            </span>
          )}
          {group === "in_progress" && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3" /> Evidence required after completion
            </span>
          )}

          {/* Ready / urgent: show proof deadline */}
          {(group === "ready" || group === "urgent") && tl && !isEnded && (
            <span className={`flex items-center gap-1 ${isUrgent ? "text-(--warn) font-semibold" : ""}`}>
              <Clock className="size-3" /> {tl}
            </span>
          )}
          {(group === "ready" || group === "urgent") && isEnded && (
            <span className="flex items-center gap-1 text-(--danger)">
              <Clock className="size-3" /> Submission closed
            </span>
          )}

          {(group === "ready" || group === "urgent" || group === "verified") && (
            <span className="flex items-center gap-1">
              <Trophy className="size-3" /> Stake + winnings on success
            </span>
          )}
        </div>

        {/* Urgent risk */}
        {isUrgent && !isEnded && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-(--warn)">
            <AlertTriangle className="size-3 mt-0.5 shrink-0" />
            <span>Miss the deadline and your stake is at risk.</span>
          </div>
        )}

        {/* Failure reasons */}
        {group === "failed" && challenge.verdict_reasons?.length ? (
          <div className="mt-2 text-xs text-(--danger)">
            {challenge.verdict_reasons.slice(0, 2).join(" · ")}
            {challenge.verdict_reasons.length > 2 && ` (+${challenge.verdict_reasons.length - 2} more)`}
          </div>
        ) : null}

        {/* Submitted info */}
        {group === "submitted" && (
          <div className="mt-2 text-xs text-(--text-muted)">
            Evidence submitted via {source.name}
            {challenge.evidence_submitted_at && (
              <> · {new Date(challenge.evidence_submitted_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
            )}
            {challenge.aivm_verification_status && (
              <> · AIVM: <span className="capitalize">{challenge.aivm_verification_status}</span></>
            )}
          </div>
        )}

        {/* Verified */}
        {group === "verified" && (
          <div className="mt-2 text-xs text-(--ok)">
            Proof verified — waiting for on-chain finalization to claim your reward.
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="px-5 pb-4 pt-3 border-t border-(--glass-border) flex items-center gap-3">
        {/* In progress — no submit, offer reminder */}
        {group === "in_progress" && (
          <>
            <span className="text-xs text-(--text-muted)">
              Challenge in progress — proof required after completion
            </span>
            {onReminder && (
              <button
                className="ml-auto text-xs flex items-center gap-1 text-(--accent) hover:underline"
                onClick={() => onReminder(challenge.challenge_id)}
              >
                <Bell className="size-3" /> Notify me
              </button>
            )}
          </>
        )}

        {/* Ready / urgent / failed — submit CTA */}
        {(group === "ready" || group === "urgent" || group === "failed") && !isEnded && (
          <button
            className={group === "failed" ? "proof-submit-cta proof-submit-cta--retry" : "proof-submit-cta"}
            onClick={() => onSubmitProof?.(challenge.challenge_id)}
          >
            {ctaLabel}
          </button>
        )}

        {group === "submitted" && (
          <span className="text-xs text-(--text-muted)">Awaiting AI verification — no action needed</span>
        )}
        {group === "verified" && (
          <Link href="/claims" className="next-step-cta cta-claim text-xs">
            Check claim status →
          </Link>
        )}

        {/* View challenge link */}
        {group !== "in_progress" && (
          <Link
            href={`/challenge/${challenge.challenge_id}`}
            className="text-xs text-(--text-muted) hover:text-(--text) transition-colors ml-auto"
          >
            View challenge →
          </Link>
        )}
        {group === "in_progress" && !onReminder && (
          <Link
            href={`/challenge/${challenge.challenge_id}`}
            className="text-xs text-(--text-muted) hover:text-(--text) transition-colors ml-auto"
          >
            View challenge →
          </Link>
        )}
      </div>
    </div>
  );
}
