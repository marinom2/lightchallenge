// webapp/app/challenge/[id]/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Abi } from "viem";
import { parseEther, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useSignTypedData,
  useBlockNumber,
} from "wagmi";

import { ABI, ADDR } from "@/lib/contracts";
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer";
import { useToasts } from "@/lib/ui/toast";
import { prettyGame } from "@/lib/games";
import { GlassIcon } from "@/app/components/ui/GlassIcon";
import * as Lucide from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ChallengeLayout from "./components/ChallengeLayout";
import AchievementClaim from "./components/AchievementClaim";
import { useHaptics } from "./hooks/useHaptics";
import { resolvePrimaryAction } from "./lib/PrimaryActionResolver";

// Extracted modules
import type { Status, ApiOut, SnapshotOut, TabKey } from "./lib/types";
import { safeLower, safeBigintFrom, safeParseId, normalizeDecimalInput, toNum, fetchJson } from "./lib/utils";
import { decodeSnapshot, decodeChallenge, normalizeApi } from "./lib/decoders";
import {
  safeText, buildDetailsRibbon, code, safe, yesno, ts, fmtNum, short, shortOrDash,
  linkAddr, linkBlock, linkTx, timeAgo, timeAgoAbs,
  formatLCAI, formatMaxParticipants, formatDuration, prettyCountdown, formatDateShort, enumLabel, computePublicStatus,
} from "./lib/formatters";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { SkeletonLine, HeroSummarySkeleton, PrimaryActionSkeleton } from "./components/Skeletons";
import { StatusCapsule, DetailsRibbon, HeroMetricsRow, HeroProgress } from "./components/HeroSection";
import { PrimaryActionCard, JoinCard } from "./components/ActionCards";
import { CollapsiblePanel, PhaseStory, ActionRow, TabBar, DLGrid, Metric, SectionPanel, ChainTimeline } from "./components/DetailPanels";


type LI = Lucide.LucideIcon;
const {
  ArrowLeft,
  RefreshCcw,
  Zap,
  Clock,
  Hourglass,
  ShieldCheck,
  BadgeCheck,
  Link2,
  Layers,
  BrainCircuit,
  SlidersHorizontal,
  Calendar,
  Coins,
  LayoutDashboard,
  Users,
  Award,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  CheckCircle2,
  XCircle,
  PauseCircle,
  AlertTriangle,
  Vote,
  Receipt,
} = Lucide;

const PartyPopperSafe: LI = (Lucide as any).PartyPopper ?? Award;

// NOTE: Types (Status, ApiOut, SnapshotOut, TabKey) → ./lib/types.ts
// NOTE: Utilities (isHexAddress, safeLower, etc.) → ./lib/utils.ts
// NOTE: Decoders (decodeChallenge, decodeSnapshot, normalizeApi) → ./lib/decoders.ts
// NOTE: Formatters (formatLCAI, timeAgo, etc.) → ./lib/formatters.tsx
// NOTE: UI components → ./components/*.tsx

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

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ChallengePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const id = params?.id;
  const challengeId = React.useMemo(() => safeParseId(id), [id]);
  const challengeIdStr = id ? String(id) : "0";

  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
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

  const [tab, setTab] = React.useState<TabKey>("details");
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

  const publicStatus = React.useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return computePublicStatus({
      now,
      start: startSec ?? null,
      end: endSec ?? null,
      joinClose: joinCloseSec ?? undefined,
      adminStatus: effectiveStatus,
      snapshotSet,
    });
  }, [startSec, endSec, joinCloseSec, effectiveStatus]);

  const treasuryLabel = publicStatus.label === "Completed" ? "Treasury" : "Current Pot";

  // Economics
  const stakeWei =
    data?.snapshot?.money?.stakeWei ??
    data?.money?.stakeWei ??
    (decoded.stakeWei ? decoded.stakeWei.toString() : null);

  const bondWei: string | null = null; // V1: no proposal bond

  // Joined total (viewer)
  const [myJoinedTotalWei, setMyJoinedTotalWei] = React.useState<bigint | null>(null);
  const [joinedLocally, setJoinedLocally] = React.useState(false);
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
        body: JSON.stringify({ subject: address, txHash }),
      });
    } catch {
      // intentionally swallowed — participation is confirmed on-chain
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
    const me = safeLower(address);

    const joinedEvent = data?.timeline?.some(
      (e) => e?.name === "Joined" && typeof e?.who === "string" && safeLower(e.who) === me
    );
    if (joinedEvent) return true;

    const part = (data as any)?.snapshot?.participants;
    if (Array.isArray(part) && part.some((p: any) => typeof p === "string" && safeLower(p) === me)) return true;

    return false;
  }, [joinedLocally, data?.timeline, (data as any)?.snapshot, address]);

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
    if (needsSettlement) {
      await finalize().catch(() => {});
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
const isCompleted = publicStatus.label === "Completed";
const isFinalizing = publicStatus.label === "Finalizing";
const isInProgress = publicStatus.label === "In progress";
const isUpcoming = publicStatus.label === "Upcoming";

const shouldShowJoin = canInitialJoin || canTopUp;
const shouldShowClaims = mounted && !checkingClaims && (claimables?.length ?? 0) > 0;
// keep vote topic visible when Pending (so you can show disabled reason)
// V1: No validator voting — removed
const shouldShowVoteTopic = false;
const shouldShowVote = false;
// Only show proof submission after the challenge period has ended
const challengeEnded = !!endSec && Math.floor(Date.now() / 1000) >= endSec;
const shouldShowProofs = Boolean(data?.proofRequired) && challengeEnded && !(participantStatus?.verdict_pass === true);

// Completion moment: show once when status flips into Completed
const prevPublicLabel = React.useRef<string | null>(null);
const [showCompletion, setShowCompletion] = React.useState(false);
React.useEffect(() => {
  const prev = prevPublicLabel.current;
  const cur = publicStatus.label;
  prevPublicLabel.current = cur;

  if (cur === "Completed" && prev !== "Completed") {
    setShowCompletion(true);
    const t = setTimeout(() => setShowCompletion(false), 2500);
    return () => clearTimeout(t);
  }
}, [publicStatus.label]);

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
      title: "Completed",
      desc: "Challenge finalized",
      cta: "Explore",
      icon: CheckCircle2,
      disabled: false,
      onClick: () => router.push("/explore"),
    };
  }

  if (isInProgress) {
    return {
      kind: "active" as const,
      title: "In progress",
      desc: "Challenge is running",
      cta: "Explore",
      icon: Clock,
      disabled: false,
      onClick: () => router.push("/explore"),
    };
  }

  if (isUpcoming) {
    return {
      kind: "upcoming" as const,
      title: "Upcoming",
      desc: joinWindowOpen ? "Join is open" : "Join closed",
      cta: "Explore",
      icon: Calendar,
      disabled: false,
      onClick: () => router.push("/explore"),
    };
  }

  return {
    kind: "neutral" as const,
    title: "Challenge",
    desc: "Review details below",
    cta: "Explore",
    icon: Info,
    disabled: false,
    onClick: () => router.push("/explore"),
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
  const currencyFromChain = decoded.currency ?? null;
  const maxParticipantsFromChain = decoded.maxParticipants ?? null;
  const participantsCountFromChain = decoded.participantsCount ?? null;

  const kindFromChain = decoded.kind ?? null;
  const outcomeFromChain = decoded.outcome ?? null;

  const detailsRibbon = buildDetailsRibbon({
    category: data?.category ?? null,
    game: prettyGame(data?.game) || null,
    mode: safeText(data?.mode) || null,
    joinCloseSec,
    startSec,
    endSec,
    externalId: data?.externalId ?? null,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Build extracted layout slots
  // ────────────────────────────────────────────────────────────────────────────
  const header = (
    <div className="space-y-5">
      {/* Pull-to-refresh micro-indicator (mobile only, subtle) */}
      {ptrEnabled ? (
        <div
          className="pointer-events-none fixed left-0 right-0 z-60"
          style={{ top: "calc(var(--navbar-top) + env(safe-area-inset-top, 0px))" }}
        >
          <div className="mx-auto w-fit">
            <div className="chip chip--soft py-1! px-3!">
              {refreshing ? (
                <span className="inline-flex items-center gap-2">
                  <RefreshCcw size={14} className="animate-spin" />
                  Refreshing…
                </span>
              ) : ptr.pullPx > 2 ? (
                <span className="inline-flex items-center gap-2">
                  <ChevronDown size={14} />
                  {ptr.armed ? "Release to refresh" : "Pull to refresh"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* HERO */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="panel"
      >
        <div className="panel-header">
          <div className="w-full flex flex-col gap-3">
            {/* Top row: back/refresh + updated */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm px-3!"
                onClick={() => router.push("/explore")}
                title="Back to Explore"
                aria-label="Back to Explore"
              >
                <ArrowLeft size={16} />
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm px-3!"
                onClick={() => fetchOnce()}
                disabled={!id || refreshing}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCcw size={16} className={refreshing ? "animate-spin" : ""} />
              </button>

              <div className="ml-auto text-xs text-(--text-muted) tabular-nums">
                {lastUpdatedAt ? `Updated ${timeAgo(lastUpdatedAt)}` : ""}
              </div>
            </div>

            {/* Title + status */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-rank badge-rank--header" aria-label={`Challenge ID ${id}`}>
                  {id ?? "—"}
                </span>

                <StatusCapsule label={publicStatus.label} note={publicStatus.note} />
              </div>

              {isInitialLoading ? (
                <div className="space-y-2">
                  {metaPreview?.title ? (
                    <>
                      <h1 className="text-xl sm:text-2xl title-premium truncate">{metaPreview.title}</h1>
                      {metaPreview.description && (
                        <p className="text-sm text-(--text-muted) leading-relaxed line-clamp-2">{metaPreview.description}</p>
                      )}
                      {/* subtle loading shimmer while chain data loads */}
                      <SkeletonLine className="h-3 w-[min(260px,50%)] opacity-40" />
                    </>
                  ) : (
                    <>
                      <SkeletonLine className="h-7 w-[min(520px,90%)]" />
                      <SkeletonLine className="h-4 w-[min(680px,95%)]" />
                    </>
                  )}
                </div>
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl title-premium truncate">
                    {metaTitle || `Challenge #${id}`}
                  </h1>

                  {metaDesc && (
                    <p className="text-sm text-(--text-muted) leading-relaxed line-clamp-2">{metaDesc}</p>
                  )}
                </>
              )}
            </div>

            {/* Details ribbon (one line, Apple-like) */}
            <DetailsRibbon text={detailsRibbon} />
          </div>
        </div>

        <div className="panel-body pt-0 bg-transparent shadow-none">
          {/* HERO BANNER */}
          {isInitialLoading ? (
            <HeroSummarySkeleton />
          ) : (
            <div className="hero-banner relative overflow-hidden rounded-2xl">
              <div className="relative z-10 p-3 sm:p-4 space-y-3">
                <HeroProgress
                  start={startSec ?? null}
                  end={endSec ?? null}
                  joinClose={joinCloseSec ?? null}
                  status={effectiveStatus}
                />
                <HeroMetricsRow
                  treasuryLabel={treasuryLabel}
                  treasuryWei={treasuryWei}
                  winnersClaimed={data?.winnersClaimed ?? 0}
                  startTs={startSec ?? null}
                  endTs={endSec ?? null}
                />
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {err ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="px-4 pb-4"
            >
              <div className="subpanel p-3">
                <div className="text-sm font-medium">Couldn’t load this challenge.</div>
                <div className="text-sm text-(--text-muted) mt-1">{err}</div>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={() => fetchOnce()} disabled={refreshing}>
                    {refreshing ? "Refreshing…" : "Try again"}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.header>
    </div>
  );

  const story = (
    <div className="panel">
      <div className="panel-header">
        <div className="min-w-0">
          <div className="text-sm font-semibold">What’s happening</div>
          <div className="text-xs text-(--text-muted)">
            Track your progress and take the next required action.
          </div>
        </div>
      </div>
      <div className="panel-body">
        <PhaseStory
          statusLabel={publicStatus.label}
          startTs={startSec ?? null}
          endTs={endSec ?? null}
          joinCloseTs={joinCloseSec ?? null}
          hasJoined={hasJoined}
          proofRequired={Boolean(data?.proofRequired)}
          canVote={canVote}
          isAdmin={isAdmin}
          canFinalize={canFinalize}
          claimablesCount={claimables?.length ?? 0}
        />
      </div>
    </div>
  );

  const details = (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-header">
          <div className="text-sm font-semibold">Details</div>
        </div>

        <div className="panel-body pt-0 space-y-4">
          <TabBar value={tab} onChange={setTab} />

          {tab === "details" && (
            <div className="space-y-3">
              <SectionPanel title="Basics" icon={LayoutDashboard} help="What this challenge is and how it appears in Explore.">
                <DLGrid
                  rows={[
                    ["Title", metaTitle || `Challenge #${id}`],
                    ...(metaDesc ? [["Description", metaDesc] as [string, string]] : []),
                    ["Category", safe(data?.category)],
                    ["Game", prettyGame(data?.game) || "—"],
                    ["Mode", safe(data?.mode)],
                    ["External ID", code(data?.externalId)],
                  ]}
                />
              </SectionPanel>

              <SectionPanel
                title="Participation"
                icon={(Lucide as any).Users ?? Users}
                help="Join window, schedule, and your current commitment."
              >
                <DLGrid
                  rows={[
                    ["Participants", fmtNum(participantsCountFromChain)],
                    ["Max participants", formatMaxParticipants(maxParticipantsFromChain)],
                    ["Join closes", ts(joinCloseSec)],
                    ["Starts", ts(startSec)],
                    ["Ends", ts(endSec)],
                    ["Your joined total", myJoinedTotalWei != null ? formatLCAI(myJoinedTotalWei.toString()) : "—"],
                  ]}
                />
              </SectionPanel>

              <SectionPanel
                title="Verification"
                icon={(Lucide as any).BadgeCheck ?? BadgeCheck}
                help="How the outcome is verified (proofs / validators)."
              >
                <DLGrid
                  rows={[
                    ["Proof required", yesno(data?.proofRequired)],
                    ["Verifier (used)", shortOrDash((data as any)?.verifierUsed ?? data?.verifier)],
                    ["Proof OK", yesno(data?.proofOk)],
                    ["Model kind", safe(data?.modelKind)],
                  ]}
                />

                {challengeIdStr ? (
                  <ActionRow
                    primaryLabel={data?.proofRequired ? "Submit proof" : "All proofs"}
                    onPrimary={() =>
                      data?.proofRequired
                        ? router.push(`/proofs/${challengeIdStr}`)
                        : router.push(`/proofs/${challengeIdStr}`)
                    }
                    secondaryLabel={data?.proofRequired ? "All proofs" : "Submit proof"}
                    onSecondary={() =>
                      data?.proofRequired
                        ? router.push(`/proofs/${challengeIdStr}`)
                        : router.push(`/proofs/${challengeIdStr}`)
                    }
                  />
                ) : null}
              </SectionPanel>
            </div>
          )}

          {tab === "economics" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="metric">
                  <div className="text-xs uppercase tracking-wider text-(--text-muted)">{treasuryLabel}</div>
                  <div className="mt-1 text-lg font-semibold">{formatLCAI(treasuryWei)}</div>
                </div>
                <div className="metric">
                  <div className="text-xs uppercase tracking-wider text-(--text-muted)">Creator stake</div>
                  <div className="mt-1 text-lg font-semibold">{formatLCAI(stakeWei)}</div>
                </div>
                <div className="metric">
                  <div className="text-xs uppercase tracking-wider text-(--text-muted)">Proposal bond</div>
                  <div className="mt-1 text-lg font-semibold">{formatLCAI(bondWei)}</div>
                </div>
              </div>

              <DLGrid
                rows={[
                  [
                    "Currency",
                    currencyFromChain === 0 || tokenFromChain === ZERO
                      ? "Native (LCAI)"
                      : tokenFromChain
                        ? `ERC-20 ${short(tokenFromChain)}`
                        : "—",
                  ],
                  ["Pool", poolFromChainStr ? formatLCAI(poolFromChainStr) : "—"],
                  ["Your joined total", myJoinedTotalWei != null ? formatLCAI(myJoinedTotalWei.toString()) : "—"],
                ]}
              />
            </>
          )}

          {tab === "model" && (
            <DLGrid
              rows={[
                ["Model kind", safe(data?.modelKind)],
                ["Model ID", safe(data?.modelId)],
                ["Model hash", code((data as any)?.modelHash)],
                ["Verifier (used)", shortOrDash((data as any)?.verifierUsed ?? data?.verifier)],
                ["Params hash", code(data?.proof?.paramsHash)],
              ]}
            />
          )}

          {tab === "onchain" && (
            <DLGrid
              rows={[
                ["Kind", enumLabel("kind", kindFromChain)],
                ["Outcome", enumLabel("outcome", outcomeFromChain)],
                ["Duration", formatDuration(decoded.duration)],
              ]}
            />
          )}

          {tab === "links" && (
            <DLGrid
              rows={[
                ["Creator", linkAddr(data?.creator)],
                ["Verifier", linkAddr((data as any)?.verifierUsed ?? data?.verifier)],
                ["Created block", data?.createdBlock ? linkBlock(data.createdBlock) : "—"],
                ["Created tx", data?.createdTx ? linkTx(data.createdTx) : "—"],
              ]}
            />
          )}

          {tab === "params" && (
            <>
              <p className="text-sm text-(--text-muted) mb-2">
                Parameters describe how the verifier interprets results (thresholds, windows, ids, etc).
              </p>

              {data?.params ? (
                <div className="subpanel">
                  <div className="subpanel__head">
                    <div className="subpanel__title">
                      <div className="text-sm font-semibold">Parameters</div>
                      <div className="text-xs text-(--text-muted)">Raw config (read-only)</div>
                    </div>
                  </div>

                  <div className="subpanel__body">
                    <pre className="overflow-auto text-xs" style={{ maxHeight: 340 }}>
                      {typeof data.params === "string" ? data.params : JSON.stringify(data.params, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-(--text-muted)">No params.</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* OUTCOME SNAPSHOT (only when set) */}
      {data?.snapshot?.set ? (
        <div className="panel">
          <div className="panel-header">
            <div className="text-sm font-semibold">Outcome & Payouts</div>
          </div>
          <div className="panel-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <Metric label="Outcome">{data.snapshot.success ? "Success ✅" : "Fail ❌"}</Metric>
              <Metric label="Committed">{formatLCAI(data.snapshot.committedPool)}</Metric>
              <Metric label="Forfeited">{formatLCAI(data.snapshot.forfeitedPool)}</Metric>
              <Metric label="Cashback">{formatLCAI(data.snapshot.cashback)}</Metric>
              <Metric label="Creator">{formatLCAI(data.snapshot.creatorAmt)}</Metric>
              <Metric label="Protocol">{formatLCAI(data.snapshot.protocolAmt)}</Metric>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const timelineNode = (
    <div className="panel">
      <div className="panel-header">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Activity</div>
          <div className="text-xs text-(--text-muted)">Readable story first. Chain links when you need them.</div>
        </div>
      </div>
      <div className="panel-body">
        {!data ? (
          <div className="text-sm text-(--text-muted)">Loading…</div>
        ) : timeline.length === 0 ? (
          <div className="text-sm text-(--text-muted)">No events yet.</div>
        ) : (
          <ChainTimeline items={timeline} />
        )}
      </div>
    </div>
  );

  const join = shouldShowJoin ? (
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
  ) : null;

  const primaryActionNode = (
    <div className="space-y-4">
      {isInitialLoading ? (
        <PrimaryActionSkeleton />
      ) : (
        <PrimaryActionCard action={primaryAction as any} busy={busy} />
      )}

      {/* Proofs */}
      {shouldShowProofs ? (
        <CollapsiblePanel
          title="Proofs"
          subtitle={data?.proofOk ? "Proof OK" : "Submit during the valid window"}
          defaultOpen={false}
          icon={BadgeCheck}
        >
          <div className="space-y-3">
            <div className="text-sm">
              <div className="text-(--text-muted) text-xs uppercase tracking-wider">Required verifier</div>
              <div className="mt-1">
                <code className="mono">{short(String((data as any)?.verifierUsed ?? data?.verifier ?? ""))}</code>
              </div>
            </div>

            {challengeIdStr ? (
              <ActionRow
                primaryLabel="Submit proof"
                onPrimary={() => router.push(`/proofs/${challengeIdStr}`)}
                secondaryLabel="All proofs"
                onSecondary={() => router.push(`/proofs/${challengeIdStr}`)}
              />
            ) : null}

            <div className="text-xs text-(--text-muted)">
              Tip: submit within the valid window. The network verifies only proofs that match the configured verifier and model.
            </div>
          </div>
        </CollapsiblePanel>
      ) : null}

      {/* Participant verification status */}
      {hasJoined && participantStatus ? (
        <div className="panel">
          <div className="panel-header">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Your verification status</div>
              <div className="text-xs text-(--text-muted)">
                Evidence submission and evaluation result
              </div>
            </div>
            {participantStatus.verdict_pass === true &&
              participantStatus.challenge_status?.toLowerCase() === "finalized" && (
                <span className="chip chip--ok">Claimable</span>
            )}
            {participantStatus.verdict_pass === true &&
              participantStatus.challenge_status?.toLowerCase() !== "finalized" &&
              ["requested", "committed", "revealed"].includes(
                participantStatus.aivm_verification_status ?? ""
              ) && (
                <span className="chip chip--info">Network pending</span>
            )}
            {participantStatus.verdict_pass === true &&
              !["requested", "committed", "revealed"].includes(
                participantStatus.aivm_verification_status ?? ""
              ) &&
              participantStatus.challenge_status?.toLowerCase() !== "finalized" && (
                <span className="chip chip--ok">Passed</span>
            )}
            {participantStatus.verdict_pass === false && (
              <span className="chip chip--bad">Failed</span>
            )}
            {participantStatus.verdict_pass === null && participantStatus.has_evidence && (
              <span className="chip chip--warn">Evaluating…</span>
            )}
            {participantStatus.verdict_pass === null && !participantStatus.has_evidence && !challengeEnded && (
              <span className="chip chip--info">In progress</span>
            )}
            {participantStatus.verdict_pass === null && !participantStatus.has_evidence && challengeEnded && (
              <span className="chip chip--soft">No evidence yet</span>
            )}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-(--text-muted) w-32 shrink-0">Evidence</span>
              <span>
                {participantStatus.has_evidence
                  ? (() => {
                      const p = participantStatus.evidence_provider ?? "";
                      const autoProviders = ["strava", "opendota", "riot"];
                      const isAuto = autoProviders.includes(p.toLowerCase());
                      return isAuto
                        ? `Collected automatically via ${p}`
                        : p
                          ? `Submitted via ${p}`
                          : "Submitted";
                    })()
                  : "Not submitted"}
              </span>
            </div>
            {participantStatus.verdict_pass === false && participantStatus.verdict_reasons?.length ? (
              <div className="flex gap-2">
                <span className="text-(--text-muted) w-32 shrink-0">Reason</span>
                <span className="text-red-400">
                  {participantStatus.verdict_reasons.slice(0, 3).join(" · ")}
                </span>
              </div>
            ) : null}
            {participantStatus.aivm_verification_status &&
              participantStatus.aivm_verification_status !== "finalized" &&
              participantStatus.verdict_pass !== false && (
                <div className="flex gap-2">
                  <span className="text-(--text-muted) w-32 shrink-0">Lightchain</span>
                  <span className="capitalize">{participantStatus.aivm_verification_status}</span>
                </div>
            )}
          {allowanceBn > 0n && (
            <div className="flex gap-2 mt-2">
              <span className="text-(--text-muted) w-32 shrink-0">Claimable</span>
              <span className="font-semibold">{formatLCAI(allowanceBn.toString())} LCAI</span>
            </div>
          )}
          </div>
        </div>
      ) : null}

      {/* Admin finalize */}
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
    </div>
  );

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaStatus}
      </div>

      <div ref={rootRef} className="space-y-5">
        <ChallengeLayout
          header={header}
          primaryAction={primaryActionNode}
          join={join}
          story={story}
          details={details}
          timeline={timelineNode}
          showCompletion={showCompletion}
        />
      </div>
    </>
  );
}

