// webapp/app/me/challenges/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import Link from "next/link";
import type { Abi } from "viem";

import { ABI, ADDR, EXPLORER_URL } from "@/lib/contracts";
import { useToasts } from "@/lib/ui/toast";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import EmptyState from "@/app/components/ui/EmptyState";
import {
  resolveLifecycle,
  toCardGroup,
  type LifecycleInput,
  type ResolvedLifecycle,
} from "@/lib/challenges/lifecycle";

/* ── Constants ─────────────────────────────────────────────────────── */

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const CP = ADDR.ChallengePay;
const TREAS = ADDR.Treasury;

/* ── Types ─────────────────────────────────────────────────────────── */

type ParticipantStatus = {
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
  title?: string;
  modelHash?: string;
  endsAt?: number | null;
  proofDeadline?: number | null;
  has_claim?: boolean;
  claimed_total_wei?: string | null;
  chain_outcome?: number | null;
  description?: string;
};

/* ── Filter types ──────────────────────────────────────────────────── */

type FilterKey = "all" | "proof" | "claim" | "active" | "won";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "proof", label: "Needs Proof" },
  { key: "claim", label: "Claimable" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
];

function matchesFilter(lc: ResolvedLifecycle, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "proof":
      return lc.shouldAppearInNeedsProof;
    case "claim":
      return lc.shouldAppearInClaimable;
    case "active":
      return lc.shouldAppearInActive;
    case "won":
      return lc.shouldAppearInWon;
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(iso);
  }
}

async function fetchMeta(
  challengeId: string,
): Promise<{
  title: string | null;
  description: string | null;
  modelHash: string | null;
  endsAt: number | null;
  proofDeadline: number | null;
}> {
  try {
    const r = await fetch(`/api/challenges/meta/${challengeId}`, {
      cache: "no-store",
    });
    if (!r.ok)
      return { title: null, description: null, modelHash: null, endsAt: null, proofDeadline: null };
    const d = await r.json();
    return {
      title: typeof d?.title === "string" && d.title ? d.title : null,
      description: typeof d?.description === "string" && d.description ? d.description : null,
      modelHash:
        typeof d?.modelHash === "string" && d.modelHash ? d.modelHash : null,
      endsAt: typeof d?.endsAt === "number" ? d.endsAt : null,
      proofDeadline:
        typeof d?.proofDeadline === "number" ? d.proofDeadline : null,
    };
  } catch {
    return { title: null, description: null, modelHash: null, endsAt: null, proofDeadline: null };
  }
}

/* ── Build lifecycle input from row ──────────────────────────────── */

function toLifecycleInput(
  row: ParticipantStatus,
  claimEligible?: boolean | null,
): LifecycleInput {
  return {
    challenge_id: row.challenge_id,
    challenge_status: row.challenge_status,
    endsAt: row.endsAt,
    proofDeadline: row.proofDeadline,
    has_evidence: row.has_evidence,
    evidence_submitted_at: row.evidence_submitted_at,
    evidence_provider: row.evidence_provider,
    verdict_pass: row.verdict_pass,
    verdict_reasons: row.verdict_reasons,
    verdict_evaluator: row.verdict_evaluator,
    verdict_updated_at: row.verdict_updated_at,
    aivm_verification_status: row.aivm_verification_status,
    chainOutcome: row.chain_outcome ?? null,
    claimEligible,
    hasClaim: row.has_claim,
    claimedTotalWei: row.claimed_total_wei,
  };
}

/* ── On-chain claim eligibility hook ──────────────────────────────── */

type ClaimCfg = {
  abi: Abi;
  address: `0x${string}`;
  functionName: string;
  args: unknown[];
};

/**
 * For each challenge where verdict_pass=true AND status=finalized,
 * simulate the 6 ChallengePay claim functions on-chain.
 * Returns Map<challengeId, boolean> — true ONLY if at least one
 * challenge-specific claim simulation succeeds for that exact challenge.
 *
 * Treasury.ethAllowanceOf is NOT used here because:
 * - It is keyed by (bucketId, address), not just address
 * - A positive allowance on an unrelated bucket would be a false positive
 * - The ChallengePay claim functions are the authoritative gate
 */
function useClaimEligibility(rows: ParticipantStatus[]) {
  const pc = usePublicClient();
  const { address } = useAccount();

  const candidateIds = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.verdict_pass === true &&
            (r.challenge_status?.toLowerCase() ?? "") === "finalized",
        )
        .map((r) => r.challenge_id),
    [rows],
  );

  const [eligMap, setEligMap] = useState<Map<string, boolean>>(new Map());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!pc || !address || candidateIds.length === 0) {
      setEligMap(new Map());
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      const base = {
        abi: ABI.ChallengePay as unknown as Abi,
        address: CP,
      } as const;
      const results = new Map<string, boolean>();

      for (const cid of candidateIds) {
        if (cancelled) break;
        const bigId = BigInt(cid);
        const candidates: ClaimCfg[] = [
          { ...base, functionName: "claimWinner", args: [bigId] },
          { ...base, functionName: "claimLoser", args: [bigId] },
          { ...base, functionName: "claimRefund", args: [bigId] },
        ];

        const checks = await Promise.all(
          candidates.map(async (cfg) => {
            try {
              await pc.simulateContract({
                ...(cfg as any),
                account: address as `0x${string}`,
              });
              return true;
            } catch {
              return false;
            }
          }),
        );

        results.set(cid, checks.some(Boolean));
      }

      if (!cancelled) {
        setEligMap(results);
        setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, address, candidateIds.join(",")]);

  return { eligMap, checking };
}

/* ── Claim execution hook ─────────────────────────────────────────── */

function useClaimExecution() {
  const pc = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const toast = useToasts((s) => s.push);

  /**
   * Find all claimable actions for a specific challenge.
   * Step 1: Simulate the 3 ChallengePay V1 claim functions.
   * Step 2: Check Treasury.ethAllowanceOf(bucketId=challengeId, address)
   *         for any uncollected grants from a prior ChallengePay claim.
   */
  const findClaimables = useCallback(
    async (challengeId: bigint): Promise<ClaimCfg[]> => {
      if (!pc || !address) return [];

      const base = {
        abi: ABI.ChallengePay as unknown as Abi,
        address: CP,
      } as const;

      const candidates: ClaimCfg[] = [
        { ...base, functionName: "claimWinner", args: [challengeId] },
        { ...base, functionName: "claimLoser", args: [challengeId] },
        { ...base, functionName: "claimRefund", args: [challengeId] },
      ];

      const checks = await Promise.all(
        candidates.map(async (cfg) => {
          try {
            await pc.simulateContract({
              ...(cfg as any),
              account: address as `0x${string}`,
            });
            return cfg;
          } catch {
            return null;
          }
        }),
      );

      const ok = checks.filter(Boolean) as ClaimCfg[];

      // Also check for uncollected Treasury allowance for THIS specific
      // challenge bucket. Treasury.ethAllowanceOf(bucketId, address).
      if (TREAS !== ZERO) {
        try {
          const raw = await pc.readContract({
            address: TREAS,
            abi: ABI.Treasury as Abi,
            functionName: "ethAllowanceOf",
            args: [challengeId, address as `0x${string}`],
          });
          const allowance =
            typeof raw === "bigint" ? raw : BigInt(String(raw ?? 0));
          if (allowance > 0n) {
            ok.push({
              abi: ABI.Treasury as unknown as Abi,
              address: TREAS,
              functionName: "claimETH",
              args: [challengeId, allowance],
            });
          }
        } catch {
          // Treasury read failed — skip
        }
      }

      return ok;
    },
    [pc, address],
  );

  const executeClaim = useCallback(
    async (
      challengeId: string,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      if (!pc || !address)
        return { success: false, error: "Wallet not connected" };

      const cid = BigInt(challengeId);

      // Try finalize first if needed
      try {
        await pc.simulateContract({
          abi: ABI.ChallengePay as unknown as Abi,
          address: CP,
          functionName: "finalize",
          args: [cid],
          account: address as `0x${string}`,
        });
        const fHash = await writeContractAsync({
          abi: ABI.ChallengePay as unknown as Abi,
          address: CP,
          functionName: "finalize",
          args: [cid],
        });
        await pc.waitForTransactionReceipt({ hash: fHash });
      } catch {
        // Already finalized — continue
      }

      const list = await findClaimables(cid);
      if (list.length === 0) {
        return {
          success: false,
          error: "No claimable rewards found on-chain.",
        };
      }

      let lastHash: string | undefined;
      const CLAIM_FN_TO_TYPE: Record<string, string> = {
        claimWinner: "winner",
        claimLoser: "loser",
        claimRefund: "refund",
        claimETH: "treasury_eth",
      };

      for (const cfg of list) {
        try {
          const hash = await writeContractAsync(cfg as any);
          toast(`Confirming ${cfg.functionName}...`, 3000, "info");
          const rc = await pc.waitForTransactionReceipt({ hash });
          if (rc.status === "success") {
            lastHash = hash;
            // Persist claim to DB (fire-and-forget)
            const claimType = CLAIM_FN_TO_TYPE[cfg.functionName] ?? cfg.functionName;
            fetch("/api/me/claims", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                challengeId: challengeId,
                subject: address,
                claimType,
                txHash: hash,
                blockNumber: rc.blockNumber ? Number(rc.blockNumber) : undefined,
              }),
            }).catch(() => {}); // Best-effort; indexer is the backup
          } else {
            return {
              success: false,
              error: `${cfg.functionName} reverted.`,
              txHash: hash,
            };
          }
        } catch (e: any) {
          return {
            success: false,
            error: e?.shortMessage || e?.message || `${cfg.functionName} failed`,
            txHash: lastHash,
          };
        }
      }

      return { success: true, txHash: lastHash };
    },
    [pc, address, writeContractAsync, findClaimables, toast],
  );

  return { executeClaim };
}

/* ── Feedback modal ────────────────────────────────────────────────── */

type FeedbackState = null | {
  kind: "success" | "error";
  challengeTitle: string;
  txHash?: string;
  error?: string;
};

function FeedbackModal({
  state,
  onClose,
  onRetry,
}: {
  state: FeedbackState;
  onClose: () => void;
  onRetry?: () => void;
}) {
  if (!state) return null;

  return (
    <div className="mc-overlay" onClick={onClose}>
      <div
        className="mc-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {state.kind === "success" ? (
          <>
            <div className="mc-modal__icon mc-modal__icon--ok">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="mc-modal__title">Reward Claimed</div>
            <div className="mc-modal__desc">{state.challengeTitle}</div>
            {state.txHash && (
              <a
                href={`${EXPLORER_URL}/tx/${state.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mc-modal__txlink"
              >
                View transaction &rarr;
              </a>
            )}
          </>
        ) : (
          <>
            <div className="mc-modal__icon mc-modal__icon--bad">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div className="mc-modal__title">Claim Failed</div>
            <div className="mc-modal__desc">
              {state.error || "Transaction reverted."}
            </div>
            {onRetry && (
              <button
                className="btn btn-primary btn-sm mt-3"
                onClick={onRetry}
              >
                Retry
              </button>
            )}
          </>
        )}
        <button
          className="mc-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── ChallengeCard ─────────────────────────────────────────────────── */

function deadlineLabel(
  stage: string,
  endsAt?: number | null,
  proofDeadline?: number | null,
): { text: string; urgent: boolean } | null {
  const nowSec = Math.floor(Date.now() / 1000);
  if (stage === "NEEDS_PROOF_URGENT" && proofDeadline) {
    const diff = proofDeadline - nowSec;
    if (diff > 0) {
      const hrs = Math.floor(diff / 3600);
      return { text: hrs < 1 ? "< 1h left to submit" : `${hrs}h left to submit`, urgent: true };
    }
  }
  if ((stage === "NEEDS_PROOF" || stage === "ACTIVE") && endsAt) {
    const diff = endsAt - nowSec;
    if (diff > 0 && diff < 172_800) { // within 48h
      const hrs = Math.floor(diff / 3600);
      return { text: hrs < 1 ? "Ends < 1h" : `Ends in ${hrs}h`, urgent: false };
    }
  }
  return null;
}

function ChallengeCard({
  row,
  lc,
  onClaim,
  claimingId,
}: {
  row: ParticipantStatus;
  lc: ResolvedLifecycle;
  onClaim: (challengeId: string, title: string) => void;
  claimingId: string | null;
}) {
  const isClaiming = claimingId === row.challenge_id;
  const displayTitle = row.title ?? `Challenge #${row.challenge_id}`;
  const dl = deadlineLabel(lc.stage, row.endsAt, row.proofDeadline);

  // Evidence context line
  const evidenceCtx = (() => {
    if (row.has_evidence && row.evidence_provider) {
      const provider = row.evidence_provider.charAt(0).toUpperCase() + row.evidence_provider.slice(1);
      const when = row.evidence_submitted_at ? ` · ${shortDate(row.evidence_submitted_at)}` : "";
      return `Evidence via ${provider}${when}`;
    }
    if (row.has_evidence) return "Evidence submitted";
    return null;
  })();

  // Verdict context
  const verdictCtx = (() => {
    if (row.verdict_pass === true) return { text: "Verdict: Passed", cls: "mc-card__verdict--pass" };
    if (row.verdict_pass === false) {
      const reasons = row.verdict_reasons?.length ? ` — ${row.verdict_reasons[0]}` : "";
      return { text: `Verdict: Failed${reasons}`, cls: "mc-card__verdict--fail" };
    }
    return null;
  })();

  return (
    <div className="mc-card" data-accent={lc.accent}>
      <div className="mc-card__row">
        <div className="mc-card__left">
          <div className="mc-card__title">{displayTitle}</div>
          {row.description && (
            <div className="mc-card__challenge-desc">{row.description}</div>
          )}
          <div className="mc-card__meta">
            #{row.challenge_id}
            {(row.joined_at || row.created_at) && (
              <>
                {" "}
                &middot; Joined{" "}
                {shortDate(row.joined_at ?? row.created_at)}
              </>
            )}
          </div>
          {evidenceCtx && (
            <div className="mc-card__evidence">{evidenceCtx}</div>
          )}
          {verdictCtx && (
            <div className={`mc-card__verdict ${verdictCtx.cls}`}>{verdictCtx.text}</div>
          )}
          {lc.description && (
            <div className="mc-card__desc-inline">{lc.description}</div>
          )}
          {dl && (
            <div className={`mc-card__deadline${dl.urgent ? " mc-card__deadline--urgent" : ""}`}>
              {dl.text}
            </div>
          )}
        </div>

        <div className="mc-card__right">
          <span className={`mc-badge mc-badge--${lc.badgeVariant}`}>
            {lc.label}
          </span>
          <div className="mc-card__action-area">
            {lc.canClaim && (
              <button
                className="mc-claim-btn"
                onClick={() => onClaim(row.challenge_id, displayTitle)}
                disabled={isClaiming}
              >
                {isClaiming ? (
                  <span className="mc-btn-loading">
                    <span className="mc-spinner" />
                    Claiming...
                  </span>
                ) : (
                  "Claim Reward"
                )}
              </button>
            )}
            {lc.canSubmitProof && (
              <Link
                href={`/proofs/${row.challenge_id}`}
                className="mc-action-btn mc-action-btn--proof"
              >
                Submit Proof &rarr;
              </Link>
            )}
            <Link
              href={`/challenge/${row.challenge_id}`}
              className="mc-card__details-link"
            >
              View details &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function MyChallengesPage() {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParticipantStatus[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const { executeClaim } = useClaimExecution();
  const { eligMap } = useClaimEligibility(rows);
  const claimingRef = useRef(false);

  /* ── Data fetching ─────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!address) {
      setRows([]);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(
        `/api/me/challenges?subject=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!d?.ok) {
        setErr(d?.error ?? "Failed to load challenges");
        return;
      }

      const challenges: ParticipantStatus[] = d.challenges ?? [];
      const metas = await Promise.all(
        challenges.map((c) => fetchMeta(c.challenge_id)),
      );
      setRows(
        challenges.map((c, i) => ({
          ...c,
          title: metas[i].title ?? undefined,
          description: metas[i].description ?? undefined,
          modelHash: metas[i].modelHash ?? undefined,
          endsAt: metas[i].endsAt,
          proofDeadline: metas[i].proofDeadline,
        })),
      );
    } catch (e: any) {
      setErr(e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Resolve lifecycle for each row ──────────────────────────── */

  const resolvedRows = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        lc: resolveLifecycle(
          toLifecycleInput(r, eligMap.get(r.challenge_id) ?? null),
        ),
      })),
    [rows, eligMap],
  );

  /* ── Derived data ──────────────────────────────────────────────── */

  const counts = useMemo(() => {
    const map: Record<FilterKey, number> = {
      all: 0,
      proof: 0,
      claim: 0,
      active: 0,
      won: 0,
    };
    for (const f of FILTERS) {
      map[f.key] =
        f.key === "all"
          ? resolvedRows.length
          : resolvedRows.filter(({ lc }) => matchesFilter(lc, f.key)).length;
    }
    return map;
  }, [resolvedRows]);

  const filteredRows = useMemo(
    () =>
      resolvedRows.filter(({ lc }) => matchesFilter(lc, activeFilter)),
    [resolvedRows, activeFilter],
  );

  const { actionRows, progressRows, doneRows } = useMemo(() => {
    const actionRows: typeof filteredRows = [];
    const progressRows: typeof filteredRows = [];
    const doneRows: typeof filteredRows = [];
    for (const item of filteredRows) {
      const g = toCardGroup(item.lc);
      if (g === "action") actionRows.push(item);
      else if (g === "progress") progressRows.push(item);
      else doneRows.push(item);
    }
    return { actionRows, progressRows, doneRows };
  }, [filteredRows]);

  /* ── Claim handler ─────────────────────────────────────────────── */

  const handleClaim = useCallback(
    async (challengeId: string, title: string) => {
      if (claimingRef.current) return; // Prevent double-click race
      claimingRef.current = true;
      setClaimingId(challengeId);
      try {
        const result = await executeClaim(challengeId);
        if (result.success) {
          setFeedback({
            kind: "success",
            challengeTitle: title,
            txHash: result.txHash,
          });
          await fetchData();
        } else {
          setFeedback({
            kind: "error",
            challengeTitle: title,
            error: result.error,
            txHash: result.txHash,
          });
        }
      } catch (e: any) {
        setFeedback({
          kind: "error",
          challengeTitle: title,
          error: e?.shortMessage || e?.message || "Unknown error",
        });
      } finally {
        setClaimingId(null);
        claimingRef.current = false;
      }
    },
    [executeClaim, fetchData],
  );

  /* ── Render ────────────────────────────────────────────────────── */

  const hasUrgentProof = counts.proof > 0;

  if (!isConnected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
        <Breadcrumb items={[{ label: "My Challenges" }]} />
        <h1 style={{ fontSize: "var(--lc-text-title)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
          My Challenges
        </h1>
        <EmptyState
          title="Connect your wallet"
          description="Connect your wallet to see active challenges, pending proofs, and claimable rewards."
          actionLabel="Browse challenges"
          onAction={() => { window.location.href = "/explore"; }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
      <Breadcrumb items={[{ label: "My Challenges" }]} />

      <div>
        <h1 style={{ fontSize: "var(--lc-text-title)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
          My Challenges
        </h1>
        <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", marginTop: "var(--lc-space-1)" }}>
          Track progress, submit evidence, and claim rewards.
        </p>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="mc-card" style={{ opacity: 1 - i * 0.2 }}>
              <div className="mc-card__row">
                <div className="mc-card__left" style={{ flex: 1 }}>
                  <div className="skeleton-line" style={{ height: 16, width: "55%", borderRadius: 6, marginBottom: 8 }} />
                  <div className="skeleton-line" style={{ height: 12, width: "35%", borderRadius: 4 }} />
                </div>
                <div className="mc-card__right">
                  <div className="skeleton-line" style={{ height: 22, width: 72, borderRadius: 99 }} />
                  <div className="skeleton-line" style={{ height: 30, width: 110, borderRadius: 8 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div style={{ padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", backgroundColor: "var(--lc-warning-muted)", color: "var(--lc-warning)", fontSize: "var(--lc-text-small)" }}>
          {err}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <EmptyState
          title="No challenges yet"
          description="Join a challenge and your progress will show up here."
          actionLabel="Browse challenges"
          onAction={() => { window.location.href = "/explore"; }}
        />
      )}

      {!loading && !err && rows.length > 0 && (
        <>
          {/* Filter pills */}
          <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap" }} role="tablist" aria-label="Filter challenges">
            {FILTERS.map(({ key, label }) => {
              const count = counts[key];
              const isActive = activeFilter === key;
              const isUrgent = key === "proof" && hasUrgentProof && !isActive;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveFilter(isActive ? "all" : key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--lc-radius-pill)",
                    fontSize: "var(--lc-text-caption)",
                    fontWeight: "var(--lc-weight-medium)" as any,
                    color: isActive ? "var(--lc-accent-text)" : isUrgent ? "var(--lc-warning)" : "var(--lc-text-secondary)",
                    backgroundColor: isActive ? "var(--lc-accent)" : isUrgent ? "var(--lc-warning-muted)" : "transparent",
                    border: isActive ? "none" : isUrgent ? "1px solid var(--lc-warning)" : "1px solid var(--lc-border)",
                    cursor: "pointer",
                    transition: "all var(--lc-dur-fast) var(--lc-ease)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--lc-space-1)",
                  }}
                >
                  {label}
                  {key !== "all" && count > 0 && (
                    <span style={{
                      fontSize: 11,
                      padding: "1px 6px",
                      borderRadius: "var(--lc-radius-pill)",
                      backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "var(--lc-bg-inset)",
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Card list */}
          {filteredRows.length === 0 ? (
            <div style={{ padding: "var(--lc-space-8)", textAlign: "center", fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)", borderRadius: "var(--lc-radius-lg)", border: "1px solid var(--lc-border)", backgroundColor: "var(--lc-bg-raised)" }}>
              No challenges match this filter.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-8)" }}>
              {actionRows.length > 0 && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-3)" }}>
                    <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>Needs Action</span>
                    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: "var(--lc-radius-pill)", backgroundColor: "var(--lc-warning-muted)", color: "var(--lc-warning)" }}>
                      {actionRows.length}
                    </span>
                  </div>
                  <div className="mc-card-list">
                    {actionRows.map(({ row, lc }) => (
                      <ChallengeCard key={row.challenge_id} row={row} lc={lc} onClaim={handleClaim} claimingId={claimingId} />
                    ))}
                  </div>
                </section>
              )}

              {progressRows.length > 0 && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-3)" }}>
                    <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>In Progress</span>
                    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: "var(--lc-radius-pill)", backgroundColor: "var(--lc-accent-muted)", color: "var(--lc-accent)" }}>
                      {progressRows.length}
                    </span>
                  </div>
                  <div className="mc-card-list">
                    {progressRows.map(({ row, lc }) => (
                      <ChallengeCard key={row.challenge_id} row={row} lc={lc} onClaim={handleClaim} claimingId={claimingId} />
                    ))}
                  </div>
                </section>
              )}

              {doneRows.length > 0 && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-3)" }}>
                    <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>Completed</span>
                    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: "var(--lc-radius-pill)", backgroundColor: "var(--lc-bg-inset)", color: "var(--lc-text-muted)" }}>
                      {doneRows.length}
                    </span>
                  </div>
                  <div className="mc-card-list">
                    {doneRows.map(({ row, lc }) => (
                      <ChallengeCard key={row.challenge_id} row={row} lc={lc} onClaim={handleClaim} claimingId={claimingId} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      <FeedbackModal
        state={feedback}
        onClose={() => setFeedback(null)}
        onRetry={
          feedback?.kind === "error"
            ? () => {
                const item = resolvedRows.find(({ lc }) => lc.canClaim);
                setFeedback(null);
                if (item)
                  handleClaim(
                    item.row.challenge_id,
                    item.row.title ?? `Challenge #${item.row.challenge_id}`,
                  );
              }
            : undefined
        }
      />
    </div>
  );
}
