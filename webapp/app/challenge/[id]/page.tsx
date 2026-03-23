// webapp/app/challenge/[id]/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Abi } from "viem";
import { parseEther, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWalletClient,
  useWriteContract,
  useSignTypedData,
  useBlockNumber,
} from "wagmi";

import { ABI, ADDR, EXPLORER_URL } from "@/lib/contracts";
import { txUrl } from "@/lib/explorer";
import { buildAuthHeaders } from "@/lib/authHeaders";
import { useToasts } from "@/lib/ui/toast";
import { prettyGame } from "@/lib/games";
import * as Lucide from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ChallengeLayout from "./components/ChallengeLayout";
import AchievementClaim from "./components/AchievementClaim";
import { useHaptics } from "./hooks/useHaptics";
import { resolvePrimaryAction } from "./lib/PrimaryActionResolver";

// Extracted modules
import type { Status, ApiOut } from "./lib/types";
import { safeLower, safeBigintFrom, safeParseId, normalizeDecimalInput, toNum, fetchJson } from "./lib/utils";
import { decodeSnapshot, decodeChallenge, normalizeApi } from "./lib/decoders";
import {
  safe, ts, fmtNum, short, timeAgo,
  formatMaxParticipants, computePublicStatus,
} from "./lib/formatters";
import { formatWeiAsUSD } from "@/lib/tokenPrice";
import { useTokenPrice } from "@/lib/useTokenPrice";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { SkeletonLine, HeroSummarySkeleton } from "./components/Skeletons";
import { PrimaryActionCard, JoinCard } from "./components/ActionCards";
import { CollapsiblePanel, DLGrid, ChainTimeline, LifecycleTimeline, VerificationExplainer } from "./components/DetailPanels";
import { ActivityFigure, detectActivity, ACTIVITY_LABELS, getActivityColor } from "./components/ActivityFigure";
import { StatusPill, CompetitionHero, GoalHero, TimeHero, QuickStats, TrustBadges } from "./components/HeroSections";
import { InviteSheet } from "@/app/challenges/create/components/InviteSheet";
import { formatWeiDual } from "@/lib/tokenPrice";


const FITNESS_CATEGORIES = new Set([
  "fitness", "walking", "running", "cycling", "hiking", "swimming",
  "strength", "yoga", "hiit", "crossfit", "rowing", "calories", "exercise",
]);
function isFitnessCategory(c?: string | null): boolean {
  return !!c && FITNESS_CATEGORIES.has(c.toLowerCase());
}

type LI = Lucide.LucideIcon;
const {
  ArrowLeft,
  RefreshCcw,
  Clock,
  Hourglass,
  BadgeCheck,
  Calendar,
  Users,
  Award,
  ChevronDown,
  Info,
  Sparkles,
  CheckCircle2,
  Vote,
  Receipt,
  Loader2,
  AlertCircle,
} = Lucide;

// NOTE: Types (Status, ApiOut, SnapshotOut) → ./lib/types.ts
// NOTE: Utilities (isHexAddress, safeLower, etc.) → ./lib/utils.ts
// NOTE: Decoders (decodeChallenge, decodeSnapshot, normalizeApi) → ./lib/decoders.ts
// NOTE: Formatters (formatWeiAsUSD, timeAgo, etc.) → ./lib/formatters.tsx + @/lib/tokenPrice
// NOTE: UI components → ./components/*.tsx

// ─────────────────────────────────────────────────────────────────────────────
// Countdown Display — reusable real-time countdown (inline)
// ─────────────────────────────────────────────────────────────────────────────
function CountdownDisplay({ targetSec }: { targetSec: number }) {
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

  React.useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, targetSec - now);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (diff <= 0) return <span className="tabular-nums">0:00</span>;

  return (
    <span className="tabular-nums font-semibold">
      {d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}
    </span>
  );
}

// PhaseBanner removed — replaced by inline cd-status-line

// ─────────────────────────────────────────────────────────────────────────────
// Verification Badge — lightweight blockchain trust indicator (mirrors iOS)
// ─────────────────────────────────────────────────────────────────────────────
function VerificationBadge({
  timeline,
}: {
  timeline: Array<{ name: string; tx: string; timestamp?: number; label: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const hasTx = timeline.some((e) => e.tx);
  if (!hasTx) return null;

  // Map timeline events to human-readable verification steps (same as iOS VerificationStep)
  // Architecture note: each step retains its tx for future per-step explorer links
  const stepMapping = [
    { name: "ChallengeCreated", label: "Challenge created" },
    { name: "Joined", label: "Participants joined" },
    { name: "ProofSubmitted", label: "Proof submitted" },
    { name: "Finalized", label: "Result finalized" },
    { name: "WinnerClaimed", label: "Rewards processed" },
    { name: "LoserClaimed", label: "Stakes returned" },
    { name: "RefundClaimed", label: "Refunds processed" },
  ];

  const steps = stepMapping
    .filter(({ name }) => timeline.some((e) => e.name === name))
    .map(({ name, label }) => {
      const matches = timeline.filter((e) => e.name === name);
      const latest = matches.reduce((a, b) => ((b.timestamp ?? 0) > (a.timestamp ?? 0) ? b : a), matches[0]);
      return { name, label, tx: latest.tx, timestamp: latest.timestamp };
    });

  // Pick best tx for explorer link (priority: Finalized > claims > proof > creation)
  const txPriority = ["Finalized", "WinnerClaimed", "LoserClaimed", "ProofSubmitted", "ChallengeCreated"];
  const primaryTx =
    txPriority.reduce<string | null>((found, n) => found || (steps.find((s) => s.name === n && s.tx)?.tx ?? null), null) ||
    steps.find((s) => s.tx)?.tx ||
    null;

  return (
    <>
      {/* Inline badge — left: static label, right: interactive action */}
      <div className="flex items-center px-4 py-3 w-full">
        <Lucide.ShieldCheck size={14} className="shrink-0 text-emerald-500/70 mr-1.5" />
        <span className="text-xs font-medium text-(--text-muted)">Verified on LightChallenge</span>
        <button
          onClick={() => setOpen(true)}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-emerald-500/70 hover:text-emerald-400 transition-colors rounded-md px-2 py-1 -mr-2 hover:bg-white/5"
        >
          View verification
          <Lucide.ChevronRight size={10} className="shrink-0 opacity-70" />
        </button>
      </div>

      {/* Verification sheet (modal) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="bg-(--card-bg,#1a1a1a) rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-base font-semibold">Verification</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium text-emerald-500 hover:text-emerald-400 transition-colors px-2 py-1 -mr-2 rounded-md hover:bg-white/5"
                >
                  Done
                </button>
              </div>

              {/* Steps */}
              <div className="px-6 pb-2">
                {steps.map((step, i) => {
                  const isLast = i === steps.length - 1;
                  return (
                    <div key={step.name} className="flex items-start gap-3.5">
                      {/* Indicator column */}
                      <div className="flex flex-col items-center w-4 shrink-0">
                        <Lucide.CheckCircle2 size={16} className="text-emerald-500/70" />
                        {!isLast && <div className="w-px flex-1 min-h-7 bg-emerald-500/10" />}
                      </div>
                      {/* Content */}
                      <div className={isLast ? "pb-0" : "pb-6"}>
                        <div className="text-sm font-medium leading-4">{step.label}</div>
                        <div className="flex flex-wrap items-center gap-x-2 mt-1">
                          {step.timestamp ? (
                            <span className="text-[11px] text-(--text-muted) leading-tight">
                              {timeAgo(step.timestamp * 1000)}
                            </span>
                          ) : null}
                          {step.tx ? (
                            <span className="text-[11px] text-(--text-muted) leading-tight mono">
                              {step.tx.slice(0, 6)}…{step.tx.slice(-4)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explorer link */}
              {primaryTx && (
                <div className="px-6 pb-6 pt-3">
                  <hr className="border-white/6 mb-5" />
                  <a
                    href={txUrl(primaryTx)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500/80 hover:text-emerald-400 transition-colors"
                  >
                    View on Lightchain Explorer
                    <Lucide.ArrowUpRight size={12} />
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Proof Status Indicator (inline)
// ─────────────────────────────────────────────────────────────────────────────
function AutoProofIndicator({
  status,
  onRetry,
}: {
  status: { state: "idle" } | { state: "collecting" } | { state: "submitted" } | { state: "error"; message: string };
  onRetry?: () => void;
}) {
  if (status.state === "idle") return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="cd-auto-proof"
    >
      {status.state === "collecting" && (
        <div className="cd-auto-proof__row cd-auto-proof__row--collecting">
          <Loader2 size={14} className="animate-spin shrink-0" />
          <span>Collecting evidence...</span>
        </div>
      )}
      {status.state === "submitted" && (
        <div className="cd-auto-proof__row cd-auto-proof__row--ok">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>Evidence submitted</span>
        </div>
      )}
      {status.state === "error" && (
        <div className="cd-auto-proof__row cd-auto-proof__row--error">
          <AlertCircle size={14} className="shrink-0" />
          <span>Error: {status.message}</span>
          {onRetry && (
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic bits
// ─────────────────────────────────────────────────────────────────────────────
// ValidatorVote removed — V1 ChallengePay has no validator approval mechanism

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const CP = (ADDR?.ChallengePay ?? ZERO) as `0x${string}`;
const TREAS = (ADDR?.Treasury ?? ZERO) as `0x${string}`;

// Types, utilities, decoders, and hooks are imported from ./lib/* and ./hooks/*

// Model labels moved to verification layer only

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ChallengePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const id = params?.id;

  // Invite context: ?invite=<inviteId> in the URL means user arrived via an invite
  const inviteId = searchParams?.get("invite") ?? null;
  const inviteIdRef = React.useRef(inviteId);
  React.useEffect(() => { inviteIdRef.current = inviteId; }, [inviteId]);
  const challengeId = React.useMemo(() => safeParseId(id), [id]);
  const challengeIdStr = id ? String(id) : "0";

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const tokenPrice = useTokenPrice();
  const { push: toastPush } = useToasts();

  // A11y: screen-reader live updates + unified toast
  const [ariaStatus, setAriaStatus] = React.useState("");

  const notify = React.useCallback(
    (msg: string) => {
      try {
        (toastPush as any)(msg);
      } catch {
        // ignore toast failures
      }

      // force re-announce even if message repeats
      setAriaStatus("");
      requestAnimationFrame(() => setAriaStatus(msg));
    },
    [toastPush]
  );

  const haptics = useHaptics();

  const rootRef = React.useRef<HTMLDivElement>(null);

  // Tab state removed — iOS-style single-column layout replaces tabs
  const [data, setData] = React.useState<ApiOut | null>(null);
  /** Fast preview from DB meta \u2014 populated before slow RPC call completes */
  const [metaPreview, setMetaPreview] = React.useState<{ title?: string; description?: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const isInitialLoading = !data && !err;
  const [mounted, setMounted] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<null | "join" | "finalize" | "claimAll">(null);

  React.useEffect(() => setMounted(true), []);

  // Skin hook
  React.useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute("data-skin");
    html.setAttribute("data-skin", "challenge");
    return () => {
      if (prev) html.setAttribute("data-skin", prev);
      else html.removeAttribute("data-skin");
    };
  }, []);

  React.useEffect(() => {
    if (id && challengeId == null) {
      setErr("Invalid challenge id.");
      setData(null);
    }
  }, [id, challengeId]);

  // ────────────────────────────────────────────────────────────────────────────
  // API Fetch (abort previous + prevents stale responses)
  // ────────────────────────────────────────────────────────────────────────────
  const fetchAbortRef = React.useRef<AbortController | null>(null);

  const fetchOnce = React.useCallback(async (): Promise<void> => {
    if (!id || challengeId == null) return;

    // Abort any in-flight request
    fetchAbortRef.current?.abort();

    // Create a new controller for THIS request
    const abort = new AbortController();
    fetchAbortRef.current = abort;

    setErr(null);
    setRefreshing(true);

    const qs = new URLSearchParams();
    if (address) qs.set("viewer", address);
    qs.set("span", "200000");

    try {
      // Phase 1: Fast DB meta fetch (~100-300ms) — show title/description immediately
      const metaFetch = fetchJson<any>(`/api/challenges/meta/${id}`, {
        signal: abort.signal,
        timeoutMs: 6000,
      }).catch(() => ({ ok: false as const, error: "meta fetch failed" }));

      // Phase 2: Slow on-chain fetch (5-15s) — runs concurrently
      const chainFetch = fetchJson<any>(`/api/challenge/${id}?${qs.toString()}`, {
        signal: abort.signal,
        timeoutMs: 20000,
      });

      // When meta arrives (fast), show title/description right away
      const mRes = await metaFetch;
      if (!abort.signal.aborted && mRes && (mRes as any).ok && (mRes as any).data) {
        const md = (mRes as any).data;
        setMetaPreview({
          title: md.title || undefined,
          description: md.description || undefined,
        });
      }

      // Wait for chain data
      const dRes = await chainFetch;

      // If we were aborted, do nothing (prevents stale UI updates)
      if (abort.signal.aborted) return;

      if (!dRes.ok) throw new Error(dRes.error || "Failed to load challenge");
      const m = mRes && (mRes as any).ok ? (mRes as any).data : null;

      const merged = normalizeApi(id, dRes.data, m);

      // Guard again before committing state
      if (abort.signal.aborted) return;

      setData(merged);
      setMetaPreview(null); // clear preview now that real data is set
      setLastUpdatedAt(Date.now());
    } catch (e: any) {
      // Ignore abort errors (common during route changes / rapid refresh)
      if (abort.signal.aborted || e?.name === "AbortError") return;

      setErr(e?.message || "Failed to load challenge");
    } finally {
      // Only the latest request is allowed to end the refreshing state
      if (fetchAbortRef.current === abort) {
        fetchAbortRef.current = null;
        setRefreshing(false);
      }
    }
  }, [id, challengeId, address]);

  // Abort on unmount
  React.useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
    };
  }, []);

  // Mobile pull-to-refresh (enabled under lg breakpoint)
  const [ptrEnabled, setPtrEnabled] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const update = () => setPtrEnabled(mq.matches);

    update();

    // Safari fallback
    if ("addEventListener" in mq) mq.addEventListener("change", update);
    else (mq as any).addListener(update);

    return () => {
      if ("removeEventListener" in mq) mq.removeEventListener("change", update);
      else (mq as any).removeListener(update);
    };
  }, []);

  const ptr = usePullToRefresh({
    rootRef: rootRef as any,
    enabled: ptrEnabled,
    onRefresh: fetchOnce,
    refreshing,
    haptics,
    thresholdPx: 72,
    maxPullPx: 140,
  });

  // Initial load: fetch on mount
  React.useEffect(() => {
    if (!id || challengeId == null) return;
    fetchOnce().catch(() => {});
  }, [id, challengeId, fetchOnce]);

  // Chain reads
  const { data: latestBlock } = useBlockNumber({ watch: true });

  const { data: chainChallenge, refetch: refetchChainChallenge } = useReadContract({
    address: CP,
    abi: ABI.ChallengePay,
    functionName: "getChallenge",
    args: [challengeId ?? 0n],
    query: { enabled: !!challengeId },
  });

  const { data: chainSnapshot, refetch: refetchChainSnapshot } = useReadContract({
    address: CP,
    abi: ABI.ChallengePay,
    functionName: "getSnapshot",
    args: [challengeId ?? 0n],
    query: { enabled: !!challengeId },
  });

  const decodedSnapshot = React.useMemo(
    () => decodeSnapshot(chainSnapshot),
    [chainSnapshot]
  );

  const { data: adminAddr } = useReadContract({
    address: CP,
    abi: ABI.ChallengePay,
    functionName: "admin",
    query: { enabled: CP !== ZERO },
  });

  const isAdmin = React.useMemo(() => {
    if (!address || !adminAddr) return false;
    return safeLower(adminAddr as string) === safeLower(address);
  }, [address, adminAddr]);

  const decoded = React.useMemo(() => decodeChallenge(chainChallenge), [chainChallenge]);

  const effectiveStatus: Status | undefined = React.useMemo(
    () => decoded.status ?? data?.status,
    [decoded.status, data?.status]
  );

  const snapshotSet = React.useMemo(() => {
    return Boolean(decodedSnapshot?.set || data?.snapshot?.set);
  }, [decodedSnapshot?.set, data?.snapshot?.set]);

  const scheduleBucket = data?.snapshot?.schedule || data?.schedule || null;
  const metaTitle = data?.title ?? data?.meta?.title ?? data?.snapshot?.meta?.title ?? "";
  const metaDesc = data?.description || data?.meta?.description || data?.snapshot?.meta?.description || "";

  const startSec = decoded.startTs ?? toNum(scheduleBucket?.startTs ?? data?.startTs);
  const endSec = React.useMemo(() => {
    if (decoded.duration != null && decoded.startTs != null) return decoded.startTs + decoded.duration;
    return toNum(scheduleBucket?.endTs ?? data?.endTs);
  }, [decoded.duration, decoded.startTs, scheduleBucket?.endTs, data?.endTs]);

  const joinCloseSec = toNum(scheduleBucket?.joinClosesTs ?? decoded.joinClosesTs);
  const proofDeadlineSec = decoded.proofDeadlineTs ?? null;

  const publicStatus = React.useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return computePublicStatus({
      now,
      start: startSec ?? null,
      end: endSec ?? null,
      joinClose: joinCloseSec ?? undefined,
      adminStatus: effectiveStatus,
      snapshotSet,
      snapshotSuccess: decodedSnapshot?.success ?? (data?.snapshot?.success as boolean | undefined) ?? null,
    });
  }, [startSec, endSec, joinCloseSec, effectiveStatus, snapshotSet, decodedSnapshot?.success, data?.snapshot?.success]);

  const treasuryLabel = publicStatus.label === "Completed" || publicStatus.label === "Challenge completed" || publicStatus.label === "Challenge failed" ? "Treasury" : "Current Pot";

  // Economics
  const stakeWei =
    data?.snapshot?.money?.stakeWei ??
    data?.money?.stakeWei ??
    (decoded.stakeWei ? decoded.stakeWei.toString() : null);

  const bondWei: string | null = null; // V1: no proposal bond

  // Joined total (viewer)
  const [myJoinedTotalWei, setMyJoinedTotalWei] = React.useState<bigint | null>(null);
  const [joinedLocally, setJoinedLocally] = React.useState(false);

  // Reset optimistic join flag when wallet changes — prevents stale "joined" state
  React.useEffect(() => {
    setJoinedLocally(false);
  }, [address]);

  const [participantStatus, setParticipantStatus] = React.useState<{
    has_evidence: boolean;
    evidence_provider: string | null;
    verdict_pass: boolean | null;
    verdict_reasons: string[] | null;
    aivm_verification_status: string | null;
    challenge_status: string | null;
  } | null>(null);

  // Fire-and-forget: record an on-chain join in public.participants.
  // Non-blocking — a failure here never surfaces to the user.
  async function recordParticipant(txHash: string) {
    if (!address || !challengeId) return;
    try {
      await fetch(`/api/challenge/${challengeId}/participant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: address,
          txHash,
          inviteId: inviteIdRef.current || undefined,
        }),
      });
    } catch {
      // intentionally swallowed — participation is confirmed on-chain
    }
  }

  // Invite sheet
  const [showInviteSheet, setShowInviteSheet] = React.useState(false);

  async function handleSendInvite(method: "email" | "wallet" | "steam", value: string) {
    if (!challengeId || !address || !walletClient) {
      notify("Connect wallet to send invites");
      return;
    }
    try {
      const authHeaders = await buildAuthHeaders(walletClient);
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          challengeId: Number(challengeId),
          method,
          value: value.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        notify("Invite sent");
        setShowInviteSheet(false);
      } else {
        notify(data.error || "Failed to send invite");
      }
    } catch {
      notify("Failed to send invite");
    }
  }

  // Auto-proof status tracking
  const [autoProofStatus, setAutoProofStatus] = React.useState<
    { state: "idle" } | { state: "collecting" } | { state: "submitted" } | { state: "error"; message: string }
  >({ state: "idle" });

  // Fire-and-forget: trigger auto-proof collection.
  // Only works during the proof window (after challenge ends, before deadline).
  // For Strava/Fitbit this pulls evidence server-side for the challenge period.
  // For Apple Health/Garmin the response tells the device to upload.
  // Called when user views a challenge in proof window, NOT at join time.
  async function triggerAutoProof() {
    if (!address || !challengeId) return;
    try {
      setAutoProofStatus({ state: "collecting" });
      const res = await fetch(`/api/challenge/${challengeId}/auto-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: address }),
      });
      if (res.ok) {
        setAutoProofStatus({ state: "submitted" });
      } else {
        const body = await res.text().catch(() => "");
        setAutoProofStatus({ state: "error", message: body || `Status ${res.status}` });
      }
    } catch (e: any) {
      setAutoProofStatus({ state: "error", message: e?.message || "Network error" });
    }
  }

  const createdBlockBn = React.useMemo(() => safeBigintFrom(data?.createdBlock) ?? 0n, [data?.createdBlock]);

  React.useEffect(() => {
    if (!pc || !address || !challengeId) {
      setMyJoinedTotalWei(null);
      return;
    }

    let stop = false;

    (async () => {
      try {
        const logs = await pc.getContractEvents({
          address: CP,
          abi: ABI.ChallengePay as Abi,
          eventName: "Joined",
          fromBlock: createdBlockBn,
          toBlock: "latest",
        });

        const me = safeLower(address);
        let total = 0n;

        for (const l of logs) {
          const logId = (l as any).args?.id as bigint | undefined;
          const who = (l as any).args?.who as string | undefined;
          const amt = (l as any).args?.amount as bigint | undefined;
          if (logId === challengeId && safeLower(who) === me && typeof amt === "bigint") total += amt;
        }

        if (!stop) setMyJoinedTotalWei(total);
      } catch {
        if (!stop) setMyJoinedTotalWei(null);
      }
    })();

    return () => {
      stop = true;
    };
  }, [pc, address, challengeId, createdBlockBn]);

  // Net pot after claims (best effort)
  const [potAfterClaimsWei, setPotAfterClaimsWei] = React.useState<bigint | null>(null);

  React.useEffect(() => {
    if (!pc || !challengeId) {
      setPotAfterClaimsWei(null);
      return;
    }

    let stop = false;

    (async () => {
      try {
        const get = (eventName: any) =>
          pc.getContractEvents({
            address: CP,
            abi: ABI.ChallengePay as Abi,
            eventName,
            fromBlock: createdBlockBn,
            toBlock: "latest",
          });

        const [joined, winner, loser, refund] =
          await Promise.all([
            get("Joined"),
            get("WinnerClaimed"),
            get("LoserClaimed"),
            get("RefundClaimed"),
          ]);

        const onlyThis = <T,>(logs: T[]) => logs.filter((l: any) => (l as any).args?.id === challengeId);
        const sumAmt = <T,>(logs: T[]) =>
          logs.reduce((acc: bigint, l: any) => {
            const a = (l as any).args?.amount as bigint | undefined;
            return typeof a === "bigint" ? acc + a : acc;
          }, 0n);

        const joinsWei = sumAmt(onlyThis(joined));
        const outWei =
          sumAmt(onlyThis(winner)) +
          sumAmt(onlyThis(loser)) +
          sumAmt(onlyThis(refund));

        const net = joinsWei - outWei;
        if (!stop) setPotAfterClaimsWei(net < 0n ? 0n : net);
      } catch {
        if (!stop) setPotAfterClaimsWei(null);
      }
    })();

    return () => {
      stop = true;
    };
  }, [pc, challengeId, createdBlockBn, latestBlock]);

  const [lastNonZeroTreasuryWei, setLastNonZeroTreasuryWei] = React.useState<string | null>(null);

  const isPositiveWei = (v?: string | null) => {
    try {
      return v != null && BigInt(v) > 0n;
    } catch {
      return false;
    }
  };

  const poolFromChainStr = decoded.poolWei ? decoded.poolWei.toString() : null;

  const currentTreasuryWei = React.useMemo(() => {
    const chainPool = isPositiveWei(poolFromChainStr) ? poolFromChainStr : null;
    const localNet = potAfterClaimsWei != null ? potAfterClaimsWei.toString() : null;

    const candidates = [
      data?.snapshot?.committedPool ?? null,
      data?.pool?.committedWei ?? null,
      localNet,
      chainPool,
    ].filter(Boolean) as string[];

    const firstPos = candidates.find(isPositiveWei);
    return firstPos ?? null;
  }, [data?.snapshot?.committedPool, data?.pool?.committedWei, potAfterClaimsWei, poolFromChainStr]);

  React.useEffect(() => {
    if (isPositiveWei(currentTreasuryWei)) setLastNonZeroTreasuryWei(currentTreasuryWei);
  }, [currentTreasuryWei]);

  const treasuryWei = currentTreasuryWei || lastNonZeroTreasuryWei;

  const hasJoined = React.useMemo(() => {
    if (joinedLocally) return true;
    if (!address) return false;

    // API-provided flag (checks on-chain Joined events server-side)
    if ((data as any)?.youJoined === true) return true;

    const me = safeLower(address);

    const joinedEvent = data?.timeline?.some(
      (e) => e?.name === "Joined" && typeof e?.who === "string" && safeLower(e.who) === me
    );
    if (joinedEvent) return true;

    const part = (data as any)?.snapshot?.participants;
    if (Array.isArray(part) && part.some((p: any) => typeof p === "string" && safeLower(p) === me)) return true;

    return false;
  }, [joinedLocally, data, address]);

  // Fetch participant status (evidence + verdict) from DB when viewer has joined
  React.useEffect(() => {
    if (!address || !challengeId || !hasJoined) {
      setParticipantStatus(null);
      return;
    }
    fetch(
      `/api/challenge/${challengeId}/participant?subject=${encodeURIComponent(address)}`,
      { cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d === "object") setParticipantStatus(d);
      })
      .catch(() => {});
  }, [address, challengeId, hasJoined]);

  // Override publicStatus with per-participant verdict when available.
  // publicStatus uses global snapshot success; this layers in personal verdict.
  const publicStatusOverride = React.useMemo(() => {
    if (!hasJoined || participantStatus?.verdict_pass == null) return publicStatus;
    // Only override when challenge is in a "completed" state
    if (publicStatus.label !== "Completed" && publicStatus.label !== "Challenge completed" && publicStatus.label !== "Challenge failed") return publicStatus;
    if (participantStatus.verdict_pass === true) return { label: "Challenge completed", note: "" };
    if (participantStatus.verdict_pass === false) return { label: "Challenge failed", note: "" };
    return publicStatus;
  }, [publicStatus, hasJoined, participantStatus?.verdict_pass]);

  // Fetch actual challenge progress (metric-based, like iOS ring)
  const [challengeProgress, setChallengeProgress] = React.useState<{
    metric: string;
    metricLabel: string;
    currentValue: number;
    goalValue: number;
    progress: number;
  } | null>(null);

  React.useEffect(() => {
    if (!address || !challengeId || !hasJoined) {
      setChallengeProgress(null);
      return;
    }
    // Always attempt progress fetch — the API itself returns goalValue:0 for
    // non-fitness challenges (no params.rules.threshold), and the hero render
    // already gates on goalValue > 0. Removing the isFitnessCategory gate here
    // fixes challenges where category metadata is missing but params.rules exist.
    fetch(
      `/api/challenge/${challengeId}/my-progress?subject=${encodeURIComponent(address)}`,
      { cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d === "object" && "progress" in d) setChallengeProgress(d);
      })
      .catch(() => {});
  }, [address, challengeId, hasJoined]);

  // Params-based goal fallback: extract metric/threshold from challenge params
  // so the hero can display the goal even when the API hasn't returned progress
  // (e.g., before joining, or when evidence hasn't been submitted yet).
  // Supports both new format (params.rules.{metric,threshold}) and legacy params.
  const paramsGoal = React.useMemo(() => {
    const LABELS: Record<string, string> = {
      steps: "Steps", steps_count: "Steps",
      distance: "Distance (km)", distance_km: "Distance (km)",
      walking_km: "Walking (km)", running_km: "Running (km)",
      cycling_km: "Cycling (km)", swimming_km: "Swimming (km)",
      hiking_km: "Hiking (km)", rowing_km: "Rowing (km)",
      strength_sessions: "Sessions", active_minutes: "Active Minutes",
      duration_min: "Active Minutes", yoga_min: "Yoga (min)", hiit_min: "HIIT (min)", crossfit_min: "CrossFit (min)",
      calories: "Calories (kcal)", exercise_time: "Exercise (min)", elev_gain_m: "Elevation (m)",
    };

    // New format: params.rules
    const rules = (data?.params as any)?.rules;
    if (rules && typeof rules === "object") {
      const metric = typeof rules.metric === "string" ? rules.metric : null;
      const threshold = typeof rules.threshold === "number" ? rules.threshold : null;
      if (metric && threshold && threshold > 0) {
        return { metric, metricLabel: LABELS[metric] ?? metric, goalValue: threshold };
      }
    }

    // conditions / dailyTarget / weeklyTarget format (current challenge flow)
    // Checks: params.dailyTarget.conditions, params.weeklyTarget.conditions,
    //         params.conditions, params.rule.dailyTarget.conditions, etc.
    const pa = data?.params as any;
    const condSources = [
      pa?.dailyTarget?.conditions,
      pa?.weeklyTarget?.conditions,
      pa?.conditions,
      pa?.rule?.dailyTarget?.conditions,
      pa?.rule?.weeklyTarget?.conditions,
      pa?.rule?.conditions,
    ];
    for (const src of condSources) {
      if (Array.isArray(src) && src.length > 0) {
        const cond = src[0];
        if (cond && typeof cond.value === "number" && cond.value > 0) {
          const m = typeof cond.metric === "string" ? cond.metric : "steps";
          return { metric: m, metricLabel: LABELS[m] ?? m, goalValue: cond.value };
        }
      }
    }

    // proof.params format (minSteps, days)
    const pp = (data as any)?.proof?.params;
    if (pp && typeof pp === "object") {
      if (typeof pp.minSteps === "number" && pp.minSteps > 0) {
        return { metric: "steps", metricLabel: "Steps", goalValue: pp.minSteps };
      }
    }

    // Legacy format: infer from known param patterns
    const p = data?.params as Record<string, unknown> | null;
    if (!p) return null;
    if (typeof p.minSteps === "number" && p.minSteps > 0)
      return { metric: "steps", metricLabel: "Steps", goalValue: p.minSteps as number };
    if (typeof p.min_distance_m === "number" && (p.min_distance_m as number) > 0)
      return { metric: "distance_km", metricLabel: "Distance (km)", goalValue: (p.min_distance_m as number) / 1000 };
    if (typeof p.min_duration_min === "number" && (p.min_duration_min as number) > 0)
      return { metric: "duration_min", metricLabel: "Active Minutes", goalValue: p.min_duration_min as number };
    if (typeof p.min_elev_gain_m === "number" && (p.min_elev_gain_m as number) > 0)
      return { metric: "elev_gain_m", metricLabel: "Elevation (m)", goalValue: p.min_elev_gain_m as number };
    if (typeof p.min_calories === "number" && (p.min_calories as number) > 0)
      return { metric: "calories", metricLabel: "Calories (kcal)", goalValue: p.min_calories as number };
    if (typeof p.minSessions === "number" && (p.minSessions as number) > 0)
      return { metric: "strength_sessions", metricLabel: "Sessions", goalValue: p.minSessions as number };
    if (typeof p.laps === "number" && (p.laps as number) > 0)
      return { metric: "swimming_km", metricLabel: "Swimming (km)", goalValue: p.laps as number };
    if (typeof p.min_minutes === "number" && (p.min_minutes as number) > 0)
      return { metric: "exercise_time", metricLabel: "Exercise (min)", goalValue: p.min_minutes as number };

    return null;
  }, [data?.params, data]);

  // Effective progress: prefer API data, fall back to params-derived goal with 0 currentValue
  const effectiveProgress = React.useMemo(() => {
    if (challengeProgress && challengeProgress.goalValue > 0) return challengeProgress;
    if (paramsGoal) return { ...paramsGoal, currentValue: 0, progress: 0 };
    return null;
  }, [challengeProgress, paramsGoal]);

  // ── Competitive challenge detection ──
  const isCompetitive = React.useMemo(() => {
    const rule = (data?.proof?.params as any)?.rule;
    if (rule?.mode === "competitive") return true;
    const topN = (data?.params as any)?.topN;
    if (typeof topN === "number" && topN > 0) return true;
    return false;
  }, [data?.proof?.params, data?.params]);

  const competitiveTopN = React.useMemo(() => {
    const rule = (data?.proof?.params as any)?.rule;
    if (rule?.topN) return Number(rule.topN);
    const topN = (data?.params as any)?.topN;
    if (typeof topN === "number" && topN > 0) return topN;
    return 1;
  }, [data?.proof?.params, data?.params]);

  const competitiveMetric = React.useMemo(() => {
    const rule = (data?.proof?.params as any)?.rule;
    const m = rule?.competitiveMetric ?? (data?.params as any)?.rules?.metric ?? null;
    const LABELS: Record<string, string> = {
      steps: "steps", steps_count: "steps",
      distance_km: "km", walking_km: "km", running_km: "km",
      cycling_km: "km", swimming_km: "km", hiking_km: "km", rowing_km: "km",
      strength_sessions: "sessions", duration_min: "min",
      yoga_min: "min", hiit_min: "min", crossfit_min: "min",
      calories: "kcal", exercise_time: "min", elev_gain_m: "m",
    };
    return { key: m, unit: m ? (LABELS[m] ?? m) : "pts" };
  }, [data?.proof?.params, data?.params]);

  // ── Leaderboard fetch for competitive challenges ──
  type LeaderboardEntry = { subject: string; score: number | null; rank: number; hasEvidence: boolean };
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);

  React.useEffect(() => {
    if (!isCompetitive || !challengeId) { setLeaderboard([]); return; }
    fetch(`/api/challenge/${challengeId}/leaderboard`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && Array.isArray(d.leaderboard)) {
          // Re-rank by score descending for competitive display
          const sorted = [...d.leaderboard]
            .sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1))
            .map((entry: any, i: number) => ({ ...entry, rank: i + 1 }));
          setLeaderboard(sorted);
        }
      })
      .catch(() => {});
  }, [isCompetitive, challengeId]);

  const myRank = React.useMemo(() => {
    if (!address || leaderboard.length === 0) return null;
    const me = address.toLowerCase();
    return leaderboard.find((e) => e.subject.toLowerCase() === me) ?? null;
  }, [leaderboard, address]);

  const rankContext = React.useMemo(() => {
    if (!myRank) return null;
    const idx = leaderboard.findIndex((e) => e.subject.toLowerCase() === (address?.toLowerCase() ?? ""));
    if (idx < 0) return null;
    const ahead = idx > 0 ? leaderboard[idx - 1] : null;
    const behind = idx < leaderboard.length - 1 ? leaderboard[idx + 1] : null;
    const gapAhead = ahead?.score != null && myRank.score != null ? Math.abs(ahead.score - myRank.score) : null;
    const gapBehind = behind?.score != null && myRank.score != null ? Math.abs(myRank.score - behind.score) : null;
    return { ahead, behind, gapAhead, gapBehind };
  }, [myRank, leaderboard, address]);

  // Auto-proof: trigger when user views challenge in proof window
  // (challenge ended, deadline not passed, joined, no evidence yet)
  React.useEffect(() => {
    if (!hasJoined || !address || !challengeId) return;
    if (participantStatus?.has_evidence) return; // already has evidence
    if (participantStatus?.verdict_pass !== undefined && participantStatus?.verdict_pass !== null) return;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!endSec || nowSec < endSec) return; // challenge hasn't ended
    // Trigger auto-proof (server validates proof window)
    void triggerAutoProof();
  }, [hasJoined, address, challengeId, endSec, participantStatus]);

  // Join window
  const joinWindowOpen = React.useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return !!joinCloseSec && now < joinCloseSec && (!!startSec ? now < startSec : true);
  }, [joinCloseSec, startSec]);

  const canInitialJoin = React.useMemo(() => {
    if (!challengeId) return false;
    if (hasJoined) return false;
    if (!effectiveStatus) return false;
    // V1: only Active challenges accept joins
    if (effectiveStatus !== "Active") return false;
    return joinWindowOpen;
  }, [challengeId, hasJoined, effectiveStatus, joinWindowOpen]);

  const canTopUp = React.useMemo(() => {
    if (!challengeId) return false;
    if (!hasJoined) return false;
    if (!effectiveStatus) return false;
    // V1: only Active challenges accept top-ups
    if (effectiveStatus !== "Active") return false;
    return joinWindowOpen;
  }, [challengeId, hasJoined, effectiveStatus, joinWindowOpen]);

  const joinDisabledReason = React.useMemo(() => {
    if (busy !== null) return "A transaction is already in progress.";
    if (!address) return "Connect your wallet to join.";
    if (!effectiveStatus) return "Challenge status is not available yet.";
    if (effectiveStatus !== "Active")
      return `Joining is disabled while status is ${effectiveStatus}.`;
    if (!joinWindowOpen) return "Join window is closed.";
    if (!hasJoined && !canInitialJoin) return "Joining is not available right now.";
    if (hasJoined && !canTopUp) return "Top-ups are not available right now.";
    return "";
  }, [busy, address, effectiveStatus, joinWindowOpen, hasJoined, canInitialJoin, canTopUp]);

  // V1: No validator voting — challenges are immediately Active
  const canVote = false;

  // Timeline grouping
  const timeline = React.useMemo(() => {
    if (!data?.timeline) return [];
    const myId = String(id ?? data.id);
    const hasChallengeId = data.timeline.some((t) => t.challengeId !== undefined);
    const list = hasChallengeId ? data.timeline.filter((t) => String(t.challengeId) === myId) : data.timeline;
    return list.slice().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  }, [data?.timeline, id, data?.id]);

  const { data: allowanceWei, refetch: refetchAllowance } = useReadContract({
    address: TREAS,
    abi: ABI.Treasury,
    functionName: "ethAllowanceOf",
    args: [challengeId ?? 0n, (address ?? ZERO) as `0x${string}`],
    query: { enabled: Boolean(TREAS && TREAS !== ZERO && address && challengeId) },
  });

  const allowanceBn = React.useMemo(() => {
    try {
      if (allowanceWei == null) return 0n;
      return typeof allowanceWei === "bigint" ? allowanceWei : BigInt(String(allowanceWei));
    } catch {
      return 0n;
    }
  }, [allowanceWei]);

  type ClaimCfg = Parameters<typeof writeContractAsync>[0];

  async function canRun(cfg: ClaimCfg) {
    if (!pc || !address) return false;
    try {
      await pc.simulateContract({ ...(cfg as any), account: address as `0x${string}` });
      return true;
    } catch {
      return false;
    }
  }

  async function findClaimables(): Promise<ClaimCfg[]> {
    if (!pc || !address || !challengeId) return [];

    const base = { abi: ABI.ChallengePay as unknown as Abi, address: CP } as const;

    const candidates: ClaimCfg[] = [
      { ...base, functionName: "claimWinner", args: [challengeId] },
      { ...base, functionName: "claimLoser", args: [challengeId] },
      { ...base, functionName: "claimRefund", args: [challengeId] },
    ];

    const checks = await Promise.all(candidates.map(async (cfg) => ((await canRun(cfg)) ? cfg : null)));
    const ok: ClaimCfg[] = checks.filter(Boolean) as ClaimCfg[];

    if (TREAS !== ZERO && allowanceBn > 0n) {
      ok.push({
        abi: ABI.Treasury as unknown as Abi,
        address: TREAS,
        functionName: "claimETH",
        args: [challengeId, allowanceBn],
      } as any);
    }

    return ok;
  }

  const [claimables, setClaimables] = React.useState<ClaimCfg[] | null>(null);
  const [checkingClaims, setCheckingClaims] = React.useState(false);

  const refreshClaimables = React.useCallback(async () => {
    setCheckingClaims(true);
    try {
      const list = await findClaimables();
      setClaimables(list);
    } finally {
      setCheckingClaims(false);
    }
  }, [allowanceBn, address, challengeId, pc]);

  React.useEffect(() => {
    refreshClaimables().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, effectiveStatus, challengeId, allowanceBn]);

  // ────────────────────────────────────────────────────────────────────────────
  // Smart Join helpers + Join logic
  // ────────────────────────────────────────────────────────────────────────────
  function splitSignature(sig: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
    const hex = sig.slice(2);
    const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
    const s = `0x${hex.slice(64, 128)}` as `0x${string}`;
    const vByte = hex.slice(128, 130);
    const v = parseInt(vByte || "1b", 16);
    return { v, r, s };
  }

  async function tokenDecimals(addr: `0x${string}`): Promise<number> {
    try {
      return Number(await pc!.readContract({ address: addr, abi: ABI.ERC20, functionName: "decimals" }));
    } catch {
      return 18;
    }
  }

  async function tokenName(addr: `0x${string}`): Promise<string> {
    try {
      return (await pc!.readContract({ address: addr, abi: ABI.ERC20, functionName: "name" })) as string;
    } catch {
      return "Token";
    }
  }

  async function tokenNonce(addr: `0x${string}`, owner: `0x${string}`): Promise<bigint> {
    try {
      return (await pc!.readContract({
        address: addr,
        abi: ABI.ERC20,
        functionName: "nonces",
        args: [owner],
      })) as bigint;
    } catch {
      return 0n;
    }
  }

  const tokenFromChain = (decoded.token ?? ZERO) as `0x${string}`;

  async function smartJoin(rawAmount?: string) {
    if (busy === "join") return;
    if (!pc) return notify("No public client");
    if (!address) return notify("Connect wallet");
    if (!challengeId) return notify("Invalid challenge id");

    try {
      setBusy("join");

      const raw = normalizeDecimalInput(rawAmount || "");
      if (!raw) return notify("Enter an amount");

      // Native
      if (!tokenFromChain || tokenFromChain === ZERO) {
        let value: bigint;
        try {
          value = parseEther(raw);
          if (value <= 0n) throw new Error("zero");
        } catch {
          return notify("Invalid amount");
        }

        try {
          await pc.simulateContract({
            abi: ABI.ChallengePay as unknown as Abi,
            address: CP,
            functionName: "joinChallengeNative",
            args: [challengeId],
            account: address as `0x${string}`,
            value: value as unknown as never,
          });
        } catch (err: any) {
          return notify(err?.shortMessage || err?.message || "Join not allowed right now");
        }

        const hash = await writeContractAsync({
          abi: ABI.ChallengePay as unknown as Abi,
          address: CP,
          functionName: "joinChallengeNative",
          args: [challengeId],
          value: value as unknown as never,
        });

        notify("Pending confirmation…");
        const rc = await pc.waitForTransactionReceipt({ hash });

        if (rc.status === "success") {
          setJoinedLocally(true);
          void recordParticipant(String(hash));
          // Auto-proof triggers during proof window, not at join time
          haptics?.success?.();
          notify("Joined ✅");
          setMyJoinedTotalWei((prev) => (prev ?? 0n) + value);
          await refetchChainChallenge();
          await fetchOnce();
        } else {
          haptics?.error?.();
          notify("Join failed ❌");
        }
        return;
      }

      // ERC-20 permit → approve fallback
      const dec = await tokenDecimals(tokenFromChain);
      let amount: bigint;
      try {
        amount = parseUnits(raw, dec);
        if (amount <= 0n) throw new Error("zero");
      } catch {
        return notify("Invalid amount");
      }

      // Permit attempt (best-effort)
      try {
        const name = await tokenName(tokenFromChain);
        const nonce = await tokenNonce(tokenFromChain, address as `0x${string}`);
        const chainId = pc.chain?.id ?? 0;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

        const domain = { name, version: "1", chainId, verifyingContract: tokenFromChain } as const;
        const types = {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        } as const;

        const message = {
          owner: address as `0x${string}`,
          spender: CP,
          value: amount,
          nonce,
          deadline,
        } as const;

        notify("Creating permit…");
        const sig = (await signTypedDataAsync({ domain, types, primaryType: "Permit", message })) as `0x${string}`;
        const { v, r, s } = splitSignature(sig);

        await pc.simulateContract({
          abi: ABI.ChallengePay as unknown as Abi,
          address: CP,
          functionName: "joinChallengeERC20WithPermit",
          args: [challengeId, amount, deadline, v, r, s],
          account: address as `0x${string}`,
        });

        notify("Submitting join…");
        const hash = await writeContractAsync({
          abi: ABI.ChallengePay as unknown as Abi,
          address: CP,
          functionName: "joinChallengeERC20WithPermit",
          args: [challengeId, amount, deadline, v, r, s],
        });

        notify("Pending confirmation…");
        const rc = await pc.waitForTransactionReceipt({ hash });

        if (rc.status === "success") {
          setJoinedLocally(true);
          void recordParticipant(String(hash));
          // Auto-proof triggers during proof window, not at join time
          haptics?.success?.();
          notify("Joined ✅");
          await refetchChainChallenge();
          await fetchOnce();
          return;
        } else {
          haptics?.error?.();
          notify("Join failed ❌");
          return;
        }
      } catch {
        notify("Permit not available → using approve flow…");
      }

      // approve → join
      const approveHash = await writeContractAsync({
        abi: ABI.ERC20 as unknown as Abi,
        address: tokenFromChain,
        functionName: "approve",
        args: [CP, amount],
      });

      notify("Approve pending…");
      await pc.waitForTransactionReceipt({ hash: approveHash });

      try {
        await pc.simulateContract({
          abi: ABI.ChallengePay as unknown as Abi,
          address: CP,
          functionName: "joinChallengeERC20",
          args: [challengeId, amount],
          account: address as `0x${string}`,
        });
      } catch (simErr: any) {
        return notify(simErr?.shortMessage || simErr?.message || "Join not allowed right now");
      }

      const joinHash = await writeContractAsync({
        abi: ABI.ChallengePay as unknown as Abi,
        address: CP,
        functionName: "joinChallengeERC20",
        args: [challengeId, amount],
      });

      notify("Join pending…");
      const jrc = await pc.waitForTransactionReceipt({ hash: joinHash });

      if (jrc.status === "success") {
        setJoinedLocally(true);
        void recordParticipant(String(joinHash));
        void triggerAutoProof();
        haptics?.success?.();
        notify("Joined ✅");
        await refetchChainChallenge();
        await fetchOnce();
      } else {
        haptics?.error?.();
        notify("Join failed ❌");
      }
    } catch (e: any) {
      haptics?.error?.();
      notify(e?.shortMessage || e?.message || "Join failed");
    } finally {
      setBusy(null);
    }
  }

  const canFinalize = React.useMemo(
    () => effectiveStatus === "Active",
    [effectiveStatus]
  );

  const finalizeDisabledReason = React.useMemo(() => {
    if (busy !== null) return "A transaction is already in progress.";
    if (!canFinalize) return "Finalization is only available when Active.";
    return "";
  }, [busy, canFinalize]);

  async function finalize() {
    if (!pc) return notify("No public client");
    if (!challengeId) return notify("Invalid challenge id");

    try {
      setBusy("finalize");
      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as unknown as Abi,
        address: CP,
        functionName: "finalize",
        args: [challengeId],
      });

      notify("Pending confirmation…");
      const rc = await pc.waitForTransactionReceipt({ hash });

      await refetchChainSnapshot().catch(() => {});
      await refetchChainChallenge().catch(() => {});

      if (rc.status === "success") haptics?.success?.();
      else haptics?.error?.();

      rc.status === "success" ? notify("Finalized ✅") : notify("Finalize failed ❌");
      await fetchOnce();
      await refreshClaimables();
    } catch (e: any) {
      haptics?.error?.();
      notify(e?.shortMessage || e?.message || "Finalize failed");
    } finally {
      setBusy(null);
    }
  }

  async function claimAll() {
    if (busy !== null) return; // Prevent double-click race
    // NOTE: Do NOT auto-finalize here — if proofs haven't been submitted
    // on-chain yet, premature finalization creates a failed snapshot
    // (success=false) that permanently breaks the challenge. The user
    // should finalize explicitly via the "Settle" button, or the pipeline
    // handles it after proof submission.
    if (needsSettlement) {
      await refreshClaimables().catch(() => {});
    }
    if (!pc) return notify("No public client");
    const list = claimables ?? [];
    if (list.length === 0) return;

    try {
      setBusy("claimAll");
      for (const cfg of list) {
        const fn = String(cfg.functionName);
        try {
          notify(`Submitting ${fn}…`);
          const hash = await writeContractAsync(cfg);
          notify("Pending confirmation…");
          const rc = await pc.waitForTransactionReceipt({ hash });

          if (rc.status === "success") {
            haptics?.success?.();
            // Persist claim to DB (fire-and-forget)
            const CLAIM_FN_MAP: Record<string, string> = {
              claimWinner: "winner", claimLoser: "loser", claimRefund: "refund",
              claimETH: "treasury_eth",
            };
            fetch("/api/me/claims", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                challengeId: String(challengeId),
                subject: address,
                claimType: CLAIM_FN_MAP[fn] ?? fn,
                txHash: hash,
                blockNumber: rc.blockNumber ? Number(rc.blockNumber) : undefined,
              }),
            }).catch(() => {});
          } else haptics?.error?.();

          rc.status === "success" ? notify(`${fn} ✓`) : notify(`${fn} failed ❌`);
        } catch (e: any) {
          haptics?.error?.();
          notify(e?.shortMessage || e?.message || `${fn} failed`);
        }

        await fetchOnce().catch(() => {});
        await refetchAllowance().catch(() => {});
      }
    } finally {
      setBusy(null);
      await refreshClaimables();
    }
  }
// ────────────────────────────────────────────────────────────────────────────
// Derived “what should the user do now”
// ────────────────────────────────────────────────────────────────────────────
const isCompleted = publicStatusOverride.label === "Completed" || publicStatusOverride.label === "Challenge completed" || publicStatusOverride.label === "Challenge failed";
const isChallengeSuccess = publicStatusOverride.label === "Challenge completed";
const isChallengeFailed = publicStatusOverride.label === "Challenge failed";
const isFinalizing = publicStatusOverride.label === "Finalizing";
const isInProgress = publicStatusOverride.label === "In progress";
const isUpcoming = publicStatusOverride.label === "Upcoming";

const shouldShowJoin = canInitialJoin || canTopUp;
// Claims ONLY visible when challenge is finalized AND claimables exist
const shouldShowClaims = mounted && !checkingClaims && (claimables?.length ?? 0) > 0 && effectiveStatus === "Finalized";
// keep vote topic visible when Pending (so you can show disabled reason)
// V1: No validator voting — removed
const shouldShowVoteTopic = false;
const shouldShowVote = false;
// Only show proof submission after the challenge period has ended
const challengeEnded = !!endSec && Math.floor(Date.now() / 1000) >= endSec;
// Verdicts are only authoritative after the proof deadline has passed.
// During the proof window the pipeline hasn't finalized yet.
const proofDeadlinePassed = challengeEnded && (
  !proofDeadlineSec || Math.floor(Date.now() / 1000) >= proofDeadlineSec
);
const shouldShowProofs = Boolean(data?.proofRequired) && challengeEnded && !(participantStatus?.verdict_pass === true);

// Completion moment: show once when status flips into Completed
const prevPublicLabel = React.useRef<string | null>(null);
const [showCompletion, setShowCompletion] = React.useState(false);
React.useEffect(() => {
  const prev = prevPublicLabel.current;
  const cur = publicStatusOverride.label;
  prevPublicLabel.current = cur;

  const isNowComplete = cur === "Completed" || cur === "Challenge completed" || cur === "Challenge failed";
  const wasComplete = prev === "Completed" || prev === "Challenge completed" || prev === "Challenge failed";
  if (isNowComplete && !wasComplete) {
    setShowCompletion(true);
    const t = setTimeout(() => setShowCompletion(false), 2500);
    return () => clearTimeout(t);
  }
}, [publicStatusOverride.label]);

// Settlement needed: challenge ended, not admin-done, and snapshot not set yet
const needsSettlement = React.useMemo(() => {
  const now = Math.floor(Date.now() / 1000);
  const ended = !!endSec && now >= endSec;
  const adminDone =
    effectiveStatus === "Finalized" ||
    effectiveStatus === "Canceled";
  return ended && !adminDone && !snapshotSet;
}, [endSec, effectiveStatus, snapshotSet]);

// ────────────────────────────────────────────────────────────────────────────
// Primary action (EXTRACTED via PrimaryActionResolver.ts) + safe fallback
// ────────────────────────────────────────────────────────────────────────────
const primaryAction = React.useMemo(() => {
  try {
    return resolvePrimaryAction({
      shouldShowClaims,
      claimablesCount: claimables?.length ?? 0,
      busy,

      isAdmin,
      canFinalize,
      effectiveStatus,
      needsSettlement,

      shouldShowJoin,
      hasJoined,
      joinDisabledReason: joinDisabledReason || undefined,

      shouldShowProofs,

      shouldShowVote: shouldShowVoteTopic,

      isFinalizing,
      isCompleted,
      isChallengeFailed,
      isChallengeSuccess,
      isInProgress,
      isUpcoming,

      joinWindowOpen,

      onClaimAll: claimAll,
      onFinalize: finalize,
      onRefresh: fetchOnce,
      onExplore: () => router.push("/explore"),
      onSubmitProof: () => router.push(`/proofs/${challengeIdStr}`),
      onOpenValidators: () => router.push(`/proofs/${challengeIdStr}`),
    });
  } catch {
    // If resolver ever breaks, keep page alive with your local fallback
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Local fallback (keeps page working even if resolver signature changes)
  // ────────────────────────────────────────────────────────────────────────────

  // 0) Auto-distributed — funds already pushed to wallet
  if (data?.autoDistributed && (effectiveStatus === "Finalized" || effectiveStatus === "Canceled")) {
    return {
      kind: "info" as const,
      title: "Funds distributed",
      desc: effectiveStatus === "Canceled"
        ? "Your stake has been automatically refunded to your wallet."
        : "Your payout has been automatically sent to your wallet.",
      cta: "View Funds",
      icon: CheckCircle2,
      disabled: false,
      onClick: () => { window.location.href = "/funds"; },
      secondaryLabel: data?.autoDistributedTx ? "View Tx" : undefined,
      onSecondary: data?.autoDistributedTx
        ? () => { window.open(`${EXPLORER_URL}/tx/${data.autoDistributedTx}`, "_blank"); }
        : undefined,
    };
  }

  // 1) Claims always win (if something is claimable, that's the action)
  if (shouldShowClaims) {
    const count = claimables?.length ?? 0;
    const disabled = busy !== null;

    return {
      kind: "claims" as const,
      title: "Claim your reward",
      desc: "Reward available — claim now",
      cta: busy === "claimAll" ? "Claiming…" : "Claim",
      icon: Receipt,
      disabled,
      disabledReason: disabled ? "A transaction is already in progress." : undefined,
      onClick: claimAll,
      secondaryLabel: "Refresh",
      onSecondary: fetchOnce,
    };
  }

  // 2) Admin settlement/finalize (only when admin + allowed)
  if (isAdmin && effectiveStatus === "Active") {
    if (needsSettlement) {
      const disabled = busy !== null;

      return {
        kind: "finalize" as const,
        title: "Settle payouts",
        desc: "Challenge ended — settle outcome so claims can be made",
        cta: busy === "finalize" ? "Settling…" : "Settle payouts",
        icon: Sparkles,
        disabled,
        disabledReason: disabled ? "A transaction is already in progress." : undefined,
        onClick: finalize,
        secondaryLabel: "Refresh",
        onSecondary: fetchOnce,
      };
    }
  }

  // 3) Join rail is informational (actual join happens in JoinCard)
  if (shouldShowJoin) {
    return {
      kind: "join" as const,
      title: hasJoined ? "Top up commitment" : "Join the challenge",
      desc: hasJoined ? "Increase your stake" : "Commit stake to participate",
      cta: hasJoined ? "Top up" : "Join",
      icon: Users,
      disabled: false,
      disabledReason: joinDisabledReason || undefined,
    };
  }

  // 4) Proofs
  if (shouldShowProofs && challengeIdStr) {
    return {
      kind: "proofs" as const,
      title: "Submit proof",
      desc: "Provide verification",
      cta: "Submit proof",
      icon: BadgeCheck,
      disabled: false,
      onClick: () => router.push(`/proofs/${challengeIdStr}`),
      secondaryLabel: "All proofs",
      onSecondary: () => router.push(`/proofs/${challengeIdStr}`),
    };
  }

  // 5) Vote rail when Pending (even if disabled)
  if (shouldShowVoteTopic && challengeIdStr) {
    return {
      kind: "vote" as const,
      title: "Validator vote",
      desc: "Vote while the window is open",
      cta: "Vote",
      icon: Vote,
      disabled: false,
      disabledReason: undefined,
    };
  }

  // 6) Status-based fallbacks
  if (isFinalizing) {
    return {
      kind: "waiting" as const,
      title: "Finalizing",
      desc: "Winners are being calculated",
      cta: "Refresh",
      icon: Hourglass,
      disabled: Boolean(refreshing),
      disabledReason: refreshing ? "Refreshing…" : undefined,
      onClick: fetchOnce,
    };
  }

  if (isCompleted) {
    return {
      kind: "done" as const,
      title: isChallengeFailed ? "Challenge failed" : isChallengeSuccess ? "Challenge completed" : "Challenge complete",
      desc: isChallengeFailed ? "You didn't reach the goal this time" : "Results have been finalized",
      cta: "View results",
      icon: isChallengeFailed ? Lucide.XCircle : CheckCircle2,
      disabled: false,
      onClick: fetchOnce,
    };
  }

  if (isInProgress && hasJoined) {
    return {
      kind: "active" as const,
      title: "Keep going",
      desc: "Your activity is being tracked automatically",
      cta: "View progress",
      icon: Clock,
      disabled: false,
      onClick: fetchOnce,
    };
  }

  if (isInProgress && !hasJoined) {
    return {
      kind: "join" as const,
      title: "Join the challenge",
      desc: "Commit stake to participate",
      cta: "Join",
      icon: Users,
      disabled: false,
      disabledReason: joinDisabledReason || undefined,
    };
  }

  if (isUpcoming) {
    return {
      kind: "upcoming" as const,
      title: "Upcoming",
      desc: joinWindowOpen ? "Join window is open — secure your spot" : "Join window closed",
      cta: joinWindowOpen ? "Join" : "View details",
      icon: Calendar,
      disabled: false,
      onClick: fetchOnce,
    };
  }

  return {
    kind: "neutral" as const,
    title: "Challenge",
    desc: "Review details below",
    cta: "View details",
    icon: Info,
    disabled: false,
    onClick: fetchOnce,
  };
}, [
  shouldShowClaims,
  claimables,
  busy,
  isAdmin,
  canFinalize,
  effectiveStatus,
  needsSettlement,
  shouldShowJoin,
  hasJoined,
  joinDisabledReason,
  shouldShowProofs,
  shouldShowVoteTopic,
  undefined,
  isFinalizing,
  isCompleted,
  isChallengeFailed,
  isChallengeSuccess,
  isInProgress,
  isUpcoming,
  joinWindowOpen,
  refreshing,
  fetchOnce,
  finalize,
  claimAll,
  challengeIdStr,
  router,
]);

  // ────────────────────────────────────────────────────────────────────────────
  // Render data
  // ────────────────────────────────────────────────────────────────────────────
  // currencyFromChain removed — internal detail not shown in product UI
  const maxParticipantsFromChain = decoded.maxParticipants ?? null;
  // On-chain participantsCount includes the creator (auto-marked on staked create).
  // Display only explicit joiners: subtract 1 for the creator.
  const rawParticipants = decoded.participantsCount ?? null;
  const participantsCountFromChain = rawParticipants != null ? Math.max(0, rawParticipants - 1) : null;

  // kind/outcome removed from UI — available in verification layer only

  // ────────────────────────────────────────────────────────────────────────────
  // Computed values for render
  // ────────────────────────────────────────────────────────────────────────────

  // Activity type (memoized, used in hero + action card)
  const activityType = React.useMemo(() => {
    if (!isFitnessCategory(data?.category)) return null;
    const paramsObj = typeof data?.params === "object" && data?.params ? data.params : {};
    const proofParams = data?.proof?.params;
    const metricField = (proofParams as any)?.rules?.metric ?? (proofParams as any)?.metric ?? (paramsObj as any)?.rules?.metric ?? (paramsObj as any)?.metric ?? null;
    return detectActivity({ title: metaTitle, description: metaDesc, modelId: data?.modelId, game: data?.game, tags: data?.tags, metric: metricField });
  }, [data?.category, data?.params, data?.proof?.params, data?.modelId, data?.game, data?.tags, metaTitle, metaDesc]);

  // User-scoped timeline (memoized, used in timeline section)
  const myTimeline = React.useMemo(() => {
    const me = address?.toLowerCase();
    const globalEvents = new Set(["ChallengeCreated", "Finalized", "OutcomeSet"]);
    return me
      ? timeline.filter((t) => globalEvents.has(t.name) || (t.who && t.who.toLowerCase() === me))
      : timeline.filter((t) => globalEvents.has(t.name));
  }, [timeline, address]);

  // Fitness instruction text for action card
  const fitnessInstruction = React.useMemo(() => {
    if (!challengeProgress || !activityType) return null;
    const label = ACTIVITY_LABELS[activityType];
    return `Cover ${challengeProgress.goalValue} ${challengeProgress.metricLabel} total`;
  }, [challengeProgress, activityType]);

  // ────────────────────────────────────────────────────────────────────────────
  // Derived progress helpers for hero (uses effectiveProgress, not challengeProgress)
  // ────────────────────────────────────────────────────────────────────────────
  const progressPct = React.useMemo(() => {
    if (effectiveProgress && effectiveProgress.goalValue > 0) {
      return Math.round((effectiveProgress.currentValue / effectiveProgress.goalValue) * 100);
    }
    return null;
  }, [effectiveProgress]);

  const progressDiff = React.useMemo(() => {
    if (!effectiveProgress || effectiveProgress.goalValue <= 0) return null;
    const diff = effectiveProgress.currentValue - effectiveProgress.goalValue;
    return { value: Math.abs(Math.round(diff * 100) / 100), positive: diff >= 0 };
  }, [effectiveProgress]);

  // Determine bar color class
  const progressBarClass = React.useMemo(() => {
    if (decodedSnapshot?.set && !decodedSnapshot?.success) return "cd-progress-hero__fill cd-progress-hero__fill--failed";
    if (decodedSnapshot?.set && decodedSnapshot?.success) return "cd-progress-hero__fill cd-progress-hero__fill--success";
    if (progressPct != null && progressPct >= 100) return "cd-progress-hero__fill cd-progress-hero__fill--success";
    return "cd-progress-hero__fill";
  }, [decodedSnapshot, progressPct]);

  // Verification data source label
  const verificationSource = React.useMemo(() => {
    if (isFitnessCategory(data?.category)) return "Apple Health / Strava";
    const gc = (data?.category ?? "").toLowerCase();
    if (["gaming","dota","lol","cs"].includes(gc)) return "Platform integration";
    return "On-chain verification";
  }, [data?.category]);

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaStatus}
      </div>

      <div ref={rootRef}>
        <ChallengeLayout showCompletion={showCompletion}>
          {/* ═══════════════════════════════════════════════════════════════════
              SECTION A — HERO PERFORMANCE CARD
              ═══════════════════════════════════════════════════════════════════ */}
          <div className="cd-header">
            {/* Pull-to-refresh indicator (mobile) */}
            {ptrEnabled && (refreshing || ptr.pullPx > 2) ? (
              <div className="cd-ptr">
                <div className="chip chip--soft">
                  {refreshing ? (
                    <span className="inline-flex items-center gap-2">
                      <RefreshCcw size={14} className="animate-spin" /> Refreshing…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <ChevronDown size={14} />
                      {ptr.armed ? "Release to refresh" : "Pull to refresh"}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {/* Nav row */}
            <div className="cd-nav">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push("/explore")} aria-label="Back">
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fetchOnce()}
                disabled={!id || refreshing}
                aria-label="Refresh"
              >
                <RefreshCcw size={16} className={refreshing ? "animate-spin" : ""} />
              </button>
              <span className="cd-nav__updated">
                {lastUpdatedAt ? `Updated ${timeAgo(lastUpdatedAt)}` : ""}
              </span>
            </div>

            {/* Invite banner */}
            {inviteId && !hasJoined ? (
              <div className="cd-invite-banner">
                <Lucide.Mail size={16} />
                <span>You&apos;ve been invited — join below to accept</span>
              </div>
            ) : null}

            {/* Title + description + status pill */}
            {isInitialLoading ? (
              <div className="cd-title-skeleton">
                {metaPreview?.title ? (
                  <>
                    <h1 className="cd-title cd-title--centered">{metaPreview.title}</h1>
                    {metaPreview.description && <p className="cd-desc cd-desc--centered">{metaPreview.description}</p>}
                    <SkeletonLine className="h-3 w-[min(260px,50%)] opacity-40 mx-auto" />
                  </>
                ) : (
                  <>
                    <SkeletonLine className="h-7 w-[min(520px,90%)] mx-auto" />
                    <SkeletonLine className="h-4 w-[min(680px,95%)] mx-auto" />
                  </>
                )}
              </div>
            ) : (
              <>
                <h1 className="cd-title cd-title--centered">{metaTitle || `Challenge #${id}`}</h1>
                {metaDesc && <p className="cd-desc cd-desc--centered">{metaDesc}</p>}
              </>
            )}

            {/* ── Status pill ── */}
            <StatusPill
              loading={isInitialLoading}
              hasJoined={hasJoined}
              participantStatus={participantStatus}
              publicLabel={publicStatusOverride.label}
            />

            {/* ── Hero: adapts to challenge type ── */}
            {!isInitialLoading && isCompetitive ? (
              <CompetitionHero
                hasJoined={hasJoined}
                myRank={myRank}
                topN={competitiveTopN}
                totalParticipants={leaderboard.length}
                metricUnit={competitiveMetric.unit}
                rankContext={rankContext}
                leaderboard={leaderboard}
                address={address}
                endSec={endSec ?? undefined}
                isCompleted={isCompleted}
              />
            ) : !isInitialLoading && effectiveProgress && effectiveProgress.goalValue > 0 ? (
              <GoalHero
                progress={effectiveProgress}
                progressPct={progressPct}
                progressDiff={progressDiff}
                barClass={progressBarClass}
                startSec={startSec ?? undefined}
                endSec={endSec ?? undefined}
                isCompleted={isCompleted}
                isFailed={isChallengeFailed}
                isSuccess={isChallengeSuccess}
              />
            ) : !isInitialLoading && startSec && endSec ? (
              <TimeHero startSec={startSec} endSec={endSec} barClass={progressBarClass} finished={!!decodedSnapshot?.set} />
            ) : null}

            {/* ── Quick stats ── */}
            {!isInitialLoading ? (
              <QuickStats
                treasuryWei={treasuryWei}
                tokenPrice={tokenPrice}
                participantsCount={participantsCountFromChain}
                isCompleted={isCompleted}
                isCompetitive={isCompetitive}
                competitiveTopN={competitiveTopN}
                activityType={activityType}
                category={data?.category}
              />
            ) : (
              <HeroSummarySkeleton />
            )}

            {/* ── Trust indicators ── */}
            <TrustBadges
              loading={isInitialLoading}
              hasEvidence={!!participantStatus?.has_evidence}
              isFinalized={!!decodedSnapshot?.set}
              hasOnChain={timeline.some(t => t.tx)}
            />

            {/* Auto-proof status indicator */}
            {hasJoined && autoProofStatus.state !== "idle" && (
              <AnimatePresence>
                <AutoProofIndicator status={autoProofStatus} onRetry={triggerAutoProof} />
              </AnimatePresence>
            )}

            {/* Error */}
            <AnimatePresence>
              {err ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="cd-error"
                >
                  <div className="text-sm font-medium">Couldn’t load this challenge.</div>
                  <div className="text-sm text-(--text-muted) mt-1">{err}</div>
                  <button className="btn btn-primary btn-sm mt-3" onClick={() => fetchOnce()} disabled={refreshing}>
                    {refreshing ? "Refreshing…" : "Try again"}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Section B removed — progress metrics now shown in hero above */}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION C — PAYOUT BREAKDOWN (compact, only after finalization)
              ═══════════════════════════════════════════════════════════════════ */}
          {!isInitialLoading && data?.snapshot?.set ? (
            <div className="cd-payout-summary">
              <div className="cd-payout-summary__grid">
                <div className="cd-metric-card">
                  <div className="cd-metric-card__label">Prize Pool</div>
                  <div className="cd-metric-card__value">{formatWeiAsUSD(data.snapshot.committedPool, tokenPrice)}</div>
                </div>
                <div className="cd-metric-card">
                  <div className="cd-metric-card__label">Forfeited</div>
                  <div className="cd-metric-card__value">{formatWeiAsUSD(data.snapshot.forfeitedPool, tokenPrice)}</div>
                </div>
                <div className="cd-metric-card">
                  <div className="cd-metric-card__label">Returned</div>
                  <div className="cd-metric-card__value">{formatWeiAsUSD(data.snapshot.cashback, tokenPrice)}</div>
                </div>
                {allowanceBn > 0n ? (
                  <div className="cd-metric-card">
                    <div className="cd-metric-card__label">Your Reward</div>
                    <div className="cd-metric-card__value cd-metric-card__value--highlight">{formatWeiAsUSD(allowanceBn.toString(), tokenPrice)}</div>
                  </div>
                ) : null}
              </div>
              {hasJoined && participantStatus?.verdict_pass === false && proofDeadlinePassed && participantStatus?.verdict_reasons?.length ? (
                <div className="cd-payout-summary__reason">
                  {participantStatus.verdict_reasons.slice(0, 2).join(" · ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Your status panel removed — status shown via resolved label in hero pill */}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION D — ACTION CARDS
              ═══════════════════════════════════════════════════════════════════ */}

          {/* Primary action — only shown for truly actionable states */}
          {!isInitialLoading && primaryAction && ["claims", "finalize", "proofs", "join", "vote"].includes((primaryAction as any).kind) && (
            <PrimaryActionCard action={primaryAction as any} busy={busy} />
          )}

          {/* Join card */}
          {shouldShowJoin ? (
            <JoinCard
              hasJoined={hasJoined}
              canInitialJoin={canInitialJoin}
              canTopUp={canTopUp}
              tokenFromChain={tokenFromChain}
              myJoinedTotalWei={myJoinedTotalWei}
              busy={busy}
              disabledReason={joinDisabledReason}
              onJoin={smartJoin}
            />
          ) : null}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION D2 — INVITE FRIEND
              ═══════════════════════════════════════════════════════════════════ */}
          {!isInitialLoading && hasJoined && effectiveStatus === "Active" && (
            <button
              type="button"
              className="cd-invite-btn"
              onClick={() => setShowInviteSheet(true)}
            >
              <Lucide.UserPlus size={16} />
              Invite a friend
            </button>
          )}

          {showInviteSheet && (
            <InviteSheet
              onClose={() => setShowInviteSheet(false)}
              onSendInvite={handleSendInvite}
            />
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION E — TIMELINE (user-aware milestone progression)
              ═══════════════════════════════════════════════════════════════════ */}
          {!isInitialLoading && (startSec || endSec || joinCloseSec) && (
            <div className="cd-section">
              <div className="text-sm font-semibold" style={{ color: "var(--lc-text)" }}>Timeline</div>
              <LifecycleTimeline
                joinCloseSec={joinCloseSec ?? null}
                startSec={startSec ?? null}
                endSec={endSec ?? null}
                proofDeadlineSec={proofDeadlineSec}
                hasJoined={hasJoined}
              />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION F — VERIFICATION (human-readable)
              ═══════════════════════════════════════════════════════════════════ */}
          {!isInitialLoading && (
            <div className="cd-verify-section">
              <div className="cd-verify-section__title">
                <Lucide.ShieldCheck size={16} className="text-emerald-500/70" />
                How this is verified
              </div>
              <div className="cd-verify-section__grid">
                <div className="cd-verify-section__label">Source</div>
                <div className="cd-verify-section__value">{verificationSource}</div>

                {effectiveProgress && effectiveProgress.goalValue > 0 ? (
                  <>
                    <div className="cd-verify-section__label">Metric</div>
                    <div className="cd-verify-section__value">{effectiveProgress.metricLabel}</div>

                    <div className="cd-verify-section__label">Rule</div>
                    <div className="cd-verify-section__value">At least {effectiveProgress.goalValue.toLocaleString()} {effectiveProgress.metricLabel.toLowerCase()}</div>
                  </>
                ) : null}

                <div className="cd-verify-section__label">Validation</div>
                <div className="cd-verify-section__value">
                  {participantStatus?.verdict_pass === true ? "Goal reached — challenge completed" :
                   participantStatus?.verdict_pass === false ? "Goal not reached — challenge failed" :
                   participantStatus?.has_evidence ? "Under review" :
                   "Automatic"}
                </div>

                <div className="cd-verify-section__label">Settlement</div>
                <div className="cd-verify-section__value">
                  {decodedSnapshot?.set ? "Settled on-chain" :
                   timeline.some(t => t.tx) ? "Recorded on-chain" :
                   "Pending"}
                </div>
              </div>

              {/* View verification action */}
              <VerificationBadge timeline={timeline as any} />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION G — DETAILS (collapsed, secondary)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsiblePanel title="Details" defaultOpen={false} icon={Info}>
            <DLGrid
              rows={[
                ...(data?.category ? [["Activity", activityType ? ACTIVITY_LABELS[activityType] : data.category.charAt(0).toUpperCase() + data.category.slice(1)] as [string, string]] : []),
                ...(data?.game ? [["Game", prettyGame(data.game) || safe(data.game)] as [string, string]] : []),
                ...(data?.mode ? [["Mode", safe(data.mode)] as [string, string]] : []),
                ["Participants", `${fmtNum(participantsCountFromChain)} / ${formatMaxParticipants(maxParticipantsFromChain)}`],
                ["Join closes", ts(joinCloseSec, "Open until start")],
                ...(myJoinedTotalWei != null && myJoinedTotalWei > 0n ? [["Your stake", formatWeiAsUSD(myJoinedTotalWei.toString(), tokenPrice)] as [string, string]] : []),
                ["Starts", ts(startSec, "TBD")],
                ["Ends", ts(endSec, "TBD")],
              ]}
            />
          </CollapsiblePanel>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION H — ADMIN (collapsed, de-emphasized)
              ═══════════════════════════════════════════════════════════════════ */}
          {isAdmin && !shouldShowClaims ? (
            <CollapsiblePanel title="Admin" subtitle="Finalize and settle" defaultOpen={false} icon={Sparkles}>
              <button
                className="btn btn-primary w-full"
                disabled={!canFinalize || busy !== null}
                onClick={finalize}
                aria-busy={busy === "finalize" ? "true" : "false"}
              >
                {busy === "finalize" ? "Finalizing…" : "Finalize challenge"}
                {busy === "finalize" ? <span className="btn__spinner" aria-hidden /> : null}
              </button>
              <div className="mt-2 text-xs text-(--text-muted)">Finalizing settles the outcome and enables claims.</div>
            </CollapsiblePanel>
          ) : null}

          {/* Achievement claims */}
          <AchievementClaim
            challengeId={Number(challengeId ?? 0)}
            address={address}
            isFinalized={effectiveStatus === "Finalized"}
            isParticipant={hasJoined}
            isWinner={shouldShowClaims && (claimables?.some((c: any) => c.functionName === "claimWinner") ?? false)}
          />
        </ChallengeLayout>
      </div>
    </>
  );
}

