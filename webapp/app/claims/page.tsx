// app/claims/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import Link from "next/link";
import type { Abi } from "viem";

import { ABI, ADDR, EXPLORER_URL } from "@/lib/contracts";
import { useToasts } from "@/lib/ui/toast";
import { timeAgo as sharedTimeAgo } from "@/lib/formatTime";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import EmptyState from "@/app/components/ui/EmptyState";
import ConnectWalletGate from "@/app/components/ui/ConnectWalletGate";
import {
  resolveLifecycle,
  toClaimSection,
  type LifecycleInput,
  type ClaimSection as ClaimSectionType,
  type ResolvedLifecycle,
} from "@/lib/challenges/lifecycle";

/* ── Constants ───────────────────────────────────────────────────────────── */
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const CP = ADDR.ChallengePay;
const TREAS = ADDR.Treasury;

/* ── Types ───────────────────────────────────────────────────────────────── */
import type { Status } from "@/lib/types/status";

type ApiOut = {
  id: string;
  status: Status;
  creator?: `0x${string}`;
  startTs?: string;
  createdBlock?: string;
  createdTx?: `0x${string}`;
  winnersClaimed?: number;
  proofRequired?: boolean;
  proofOk?: boolean;
  title?: string;
  description?: string;
  params?: string;
  category?: string;
  verifier?: `0x${string}`;
  kindKey?: "walking" | "running" | "dota" | "cs" | "lol";
  form?: Record<string, string | number>;
  timeline: {
    name: string;
    label: string;
    tx: `0x${string}`;
    block: string;
    timestamp?: number;
  }[];
};

type RewardRow = {
  challenge_id: string;
  challenge_status: string | null;
  verdict_pass: boolean | null;
  verdict_updated_at: string | null;
  has_evidence: boolean;
  endsAt?: number | null;
  proofDeadline?: number | null;
  aivm_verification_status?: string | null;
  joined_at?: string | null;
  chain_outcome?: number | null;
  title?: string;
  description?: string;
};

type RewardItem = { row: RewardRow; lc: ResolvedLifecycle };

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function short(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
const timeAgo = sharedTimeAgo;
function chipClassForStatus(s: Status) {
  switch (s) {
    case "Active":    return "chip--ok";
    case "Finalized": return "chip--info";
    case "Canceled":  return "chip--warn";
    default:          return "";
  }
}

function toInput(r: RewardRow): LifecycleInput {
  return {
    challenge_id: r.challenge_id,
    challenge_status: r.challenge_status,
    endsAt: r.endsAt,
    proofDeadline: r.proofDeadline,
    has_evidence: r.has_evidence,
    verdict_pass: r.verdict_pass,
    aivm_verification_status: r.aivm_verification_status,
    chainOutcome: r.chain_outcome ?? null,
  };
}

/* ── Claim execution hook ─────────────────────────────────────────────────── */
type ClaimCfg = {
  abi: Abi;
  address: `0x${string}`;
  functionName: string;
  args: unknown[];
};

function useClaimExecution() {
  const pc = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const toast = useToasts((s) => s.push);

  const findClaimables = useCallback(
    async (challengeId: bigint): Promise<ClaimCfg[]> => {
      if (!pc || !address) return [];
      const base = { abi: ABI.ChallengePay as unknown as Abi, address: CP } as const;
      const candidates: ClaimCfg[] = [
        { ...base, functionName: "claimWinner", args: [challengeId] },
        { ...base, functionName: "claimLoser", args: [challengeId] },
        { ...base, functionName: "claimRefund", args: [challengeId] },
      ];
      const checks = await Promise.all(
        candidates.map(async (cfg) => {
          try {
            await pc.simulateContract({ ...(cfg as any), account: address as `0x${string}` });
            return cfg;
          } catch { return null; }
        }),
      );
      const ok = checks.filter(Boolean) as ClaimCfg[];
      if (TREAS !== ZERO) {
        try {
          const raw = await pc.readContract({
            address: TREAS, abi: ABI.Treasury as Abi,
            functionName: "ethAllowanceOf", args: [challengeId, address as `0x${string}`],
          });
          const allowance = typeof raw === "bigint" ? raw : BigInt(String(raw ?? 0));
          if (allowance > 0n) {
            ok.push({ abi: ABI.Treasury as unknown as Abi, address: TREAS, functionName: "claimETH", args: [challengeId, allowance] });
          }
        } catch { /* skip */ }
      }
      return ok;
    },
    [pc, address],
  );

  const executeClaim = useCallback(
    async (challengeId: string): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      if (!pc || !address) return { success: false, error: "Wallet not connected" };
      const cid = BigInt(challengeId);
      try {
        await pc.simulateContract({
          abi: ABI.ChallengePay as unknown as Abi, address: CP,
          functionName: "finalize", args: [cid], account: address as `0x${string}`,
        });
        const fHash = await writeContractAsync({
          abi: ABI.ChallengePay as unknown as Abi, address: CP,
          functionName: "finalize", args: [cid],
        });
        await pc.waitForTransactionReceipt({ hash: fHash });
      } catch { /* already finalized */ }

      const list = await findClaimables(cid);
      if (list.length === 0) return { success: false, error: "No claimable rewards found on-chain." };

      const CLAIM_FN_TO_TYPE: Record<string, string> = {
        claimWinner: "winner", claimLoser: "loser", claimRefund: "refund",
        claimETH: "treasury_eth",
      };
      let lastHash: string | undefined;
      for (const cfg of list) {
        try {
          const hash = await writeContractAsync(cfg as any);
          toast(`Confirming ${cfg.functionName}…`, 3000, "info");
          const rc = await pc.waitForTransactionReceipt({ hash });
          if (rc.status === "success") {
            lastHash = hash;
            const claimType = CLAIM_FN_TO_TYPE[cfg.functionName] ?? cfg.functionName;
            fetch("/api/me/claims", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ challengeId, subject: address, claimType, txHash: hash,
                blockNumber: rc.blockNumber ? Number(rc.blockNumber) : undefined }),
            }).catch(() => {});
          } else {
            return { success: false, error: `${cfg.functionName} reverted.`, txHash: hash };
          }
        } catch (e: any) {
          return { success: false, error: e?.shortMessage || e?.message || `${cfg.functionName} failed`, txHash: lastHash };
        }
      }
      return { success: true, txHash: lastHash };
    },
    [pc, address, writeContractAsync, findClaimables, toast],
  );

  return { executeClaim };
}

/* ── Reward board (wallet-aware) ─────────────────────────────────────────── */
function RewardBoard({ address }: { address: string }) {
  const [rows, setRows] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<{ kind: "ok" | "err"; challengeId: string; txHash?: string; error?: string } | null>(null);
  const [activeSection, setActiveSection] = useState<ClaimSectionType | null>(null);
  const claimingRef = useRef(false);
  const { executeClaim } = useClaimExecution();
  const toast = useToasts((s) => s.push);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/me/challenges?subject=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(async (d) => {
        if (!d?.ok) return;
        const challenges: any[] = d.challenges ?? [];
        const enriched = await Promise.all(
          challenges.map(async (c) => {
            try {
              const r = await fetch(`/api/challenges/meta/${c.challenge_id}`, { cache: "no-store" });
              const meta = r.ok ? await r.json() : {};
              return {
                ...c,
                title: meta?.title ?? undefined,
                description: typeof meta?.description === "string" && meta.description ? meta.description : undefined,
                endsAt: typeof meta?.endsAt === "number" ? meta.endsAt : undefined,
                proofDeadline: typeof meta?.proofDeadline === "number" ? meta.proofDeadline : undefined,
              };
            } catch { return c; }
          })
        );
        setRows(enriched);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  // Resolve lifecycle and categorize
  const allItems: RewardItem[] = rows.map((row) => ({ row, lc: resolveLifecycle(toInput(row)) }));

  const claimable: RewardItem[] = [];
  const pending: RewardItem[] = [];
  const lost: RewardItem[] = [];
  const won: RewardItem[] = [];

  for (const item of allItems) {
    const section = toClaimSection(item.lc);
    if (section === "claimable") claimable.push(item);
    else if (section === "pending") pending.push(item);
    else if (section === "lost") lost.push(item);
    else if (section === "won") won.push(item);
  }

  const handleClaim = useCallback(async (challengeId: string) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    setClaimingId(challengeId);
    setClaimResult(null);
    try {
      const result = await executeClaim(challengeId);
      if (result.success) {
        toast("Reward claimed successfully!", 4000, "success");
        setClaimResult({ kind: "ok", challengeId, txHash: result.txHash });
        // Refresh rows
        setLoading(true);
        const r = await fetch(`/api/me/challenges?subject=${encodeURIComponent(address)}`, { cache: "no-store" });
        const d = await r.json();
        if (d?.ok) {
          const challenges: any[] = d.challenges ?? [];
          const enriched = await Promise.all(
            challenges.map(async (c) => {
              try {
                const mr = await fetch(`/api/challenges/meta/${c.challenge_id}`, { cache: "no-store" });
                const meta = mr.ok ? await mr.json() : {};
                return { ...c, title: meta?.title ?? undefined,
                  description: typeof meta?.description === "string" && meta.description ? meta.description : undefined,
                  endsAt: typeof meta?.endsAt === "number" ? meta.endsAt : undefined,
                  proofDeadline: typeof meta?.proofDeadline === "number" ? meta.proofDeadline : undefined };
              } catch { return c; }
            })
          );
          setRows(enriched);
        }
        setLoading(false);
      } else {
        setClaimResult({ kind: "err", challengeId, error: result.error, txHash: result.txHash });
      }
    } catch (e: any) {
      setClaimResult({ kind: "err", challengeId, error: e?.shortMessage || e?.message || "Unknown error" });
    } finally {
      setClaimingId(null);
      claimingRef.current = false;
    }
  }, [executeClaim, address, toast]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="panel grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ "--tw-divide-opacity": 1 } as React.CSSProperties}>
          {["Claimable", "Pending", "Lost", "Claimed"].map((s) => (
            <div key={s} className="metric text-center py-4 animate-pulse">
              <div className="text-2xl font-bold tabular-nums">…</div>
              <div className="text-xs font-semibold uppercase tracking-widest mt-1">{s}</div>
            </div>
          ))}
        </div>
        <div className="panel p-4 text-sm text-(--text-muted) animate-pulse">Loading rewards…</div>
      </div>
    );
  }

  const totalParticipated = rows.length;

  if (totalParticipated === 0) {
    return (
      <EmptyState
        title="No rewards yet"
        description="Join challenges and win to earn rewards. Passed challenges appear here once finalized."
        actionLabel="Browse challenges"
        onAction={() => { window.location.href = "/explore"; }}
      />
    );
  }

  // Which sections to show given activeSection filter
  const showSection = (s: ClaimSectionType) => activeSection === null || activeSection === s;

  const metricBtn = (section: ClaimSectionType, count: number, label: string, sub: string, highlight?: boolean) => {
    const isActive = activeSection === section;
    return (
      <button
        key={label}
        className={[
          "metric text-center py-4 transition-colors cursor-pointer",
          isActive ? "bg-(--glass-hover)" : "hover:bg-(--glass)",
        ].join(" ")}
        onClick={() => setActiveSection(isActive ? null : section)}
        aria-pressed={isActive}
        title={`Filter by ${label}`}
      >
        <div
          className="text-2xl font-bold tabular-nums transition-colors"
          style={{ color: highlight && count > 0 ? "var(--status-claim)" : undefined }}
        >
          {count}
        </div>
        <div className="text-xs font-semibold uppercase tracking-widest mt-1">{label}</div>
        <div className="text-[11px] text-(--text-muted) mt-0.5">{sub}</div>
        {isActive && <div className="mt-1 text-[10px] text-(--text-muted) italic">click to clear</div>}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Claim result banner */}
      {claimResult && (
        <div className={`panel p-4 flex items-center justify-between gap-3 ${claimResult.kind === "ok" ? "border-(--status-claim)/30" : "border-(--status-done-bad)/30"}`}>
          <div className="text-sm">
            {claimResult.kind === "ok" ? (
              <span className="font-semibold text-(--status-claim)">✓ Reward claimed successfully</span>
            ) : (
              <span className="font-semibold text-(--danger)">Claim failed — {claimResult.error}</span>
            )}
            {claimResult.txHash && (
              <a href={`${EXPLORER_URL}/tx/${claimResult.txHash}`} target="_blank" rel="noopener noreferrer"
                className="ml-3 text-(--text-muted) underline underline-offset-2 text-xs">
                View tx →
              </a>
            )}
          </div>
          <button className="text-(--text-muted) hover:text-(--text) text-xs" onClick={() => setClaimResult(null)}>Dismiss</button>
        </div>
      )}

      {/* Summary stats — clickable filters */}
      <div className="panel grid grid-cols-2 sm:grid-cols-4 divide-x overflow-hidden" style={{ "--tw-divide-opacity": 1 } as React.CSSProperties}>
        {metricBtn("claimable", claimable.length, "Claimable", "Ready now", true)}
        {metricBtn("pending", pending.length, "Pending", "Awaiting finalization")}
        {metricBtn("lost", lost.length, "Lost", "Did not pass")}
        {metricBtn("won", won.length, "Claimed", `${claimable.length + won.length} won all time`)}
      </div>

      {activeSection && (
        <div className="text-xs text-(--text-muted) -mt-2">
          Showing <span className="font-semibold text-(--text)">{activeSection}</span> — click metric to clear filter
        </div>
      )}

      {/* Claimable rewards */}
      {showSection("claimable") && claimable.length > 0 && (
        <RewardSection
          title="Claimable now"
          subtitle="Finalized challenges you won — claim your stake and winnings"
          items={claimable}
          section="claimable"
          onClaim={handleClaim}
          claimingId={claimingId}
        />
      )}

      {/* Pending finalization */}
      {showSection("pending") && pending.length > 0 && (
        <RewardSection
          title="Awaiting finalization"
          subtitle="You passed — waiting for on-chain finalization before you can claim"
          items={pending}
          section="pending"
          onClaim={handleClaim}
          claimingId={claimingId}
        />
      )}

      {/* Lost / failed / no-payout */}
      {showSection("lost") && lost.length > 0 && (
        <RewardSection
          title="Did not pass"
          subtitle="These challenges were not met or resulted in no payout"
          items={lost}
          section="lost"
          onClaim={handleClaim}
          claimingId={claimingId}
        />
      )}

      {/* Previously claimed */}
      {showSection("won") && won.length > 0 && (
        <RewardSection
          title="Previously claimed"
          subtitle="Rewards already collected"
          items={won}
          section="won"
          onClaim={handleClaim}
          claimingId={claimingId}
        />
      )}

      {claimable.length === 0 && pending.length === 0 && lost.length === 0 && won.length === 0 && (
        <div className="panel p-6 text-center">
          <div className="text-base font-semibold mb-1">No reward activity yet</div>
          <p className="text-sm text-(--text-muted)">
            Your challenges haven&apos;t been evaluated yet.{" "}
            <Link href="/me/challenges" className="underline underline-offset-2">Check status</Link>
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Reward section component ────────────────────────────────────────────── */
function RewardSection({
  title,
  subtitle,
  items,
  section,
  onClaim,
  claimingId,
}: {
  title: string;
  subtitle: string;
  items: RewardItem[];
  section: ClaimSectionType;
  onClaim: (challengeId: string) => void;
  claimingId: string | null;
}) {
  const accentColor = section === "claimable" ? "text-(--accent)" : "text-(--text-muted)";
  const dataStatus = section === "claimable" ? "claim"
    : section === "pending" ? "approved"
    : section === "won" ? "ok"
    : "bad";

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">{title}</h2>
        <span className={`text-xs font-bold tabular-nums ${accentColor}`}>{items.length}</span>
      </div>
      <p className="text-xs text-(--text-muted) mb-3">{subtitle}</p>

      <div className="space-y-2">
        {items.map(({ row, lc }) => {
          const displayTitle = row.title ?? `Challenge #${row.challenge_id}`;
          const isClaiming = claimingId === row.challenge_id;

          // Badge: use lifecycle as source of truth
          const badgeClass = lc.badgeVariant === "claim" ? "chip--claim"
            : lc.badgeVariant === "ok" ? "chip--ok"
            : lc.badgeVariant === "bad" ? "chip--bad"
            : lc.badgeVariant === "action" ? "chip--action"
            : lc.badgeVariant === "soft" ? "chip--soft"
            : "chip--info";

          return (
            <div
              key={row.challenge_id}
              className="challenge-card p-4 pl-5"
              data-status={dataStatus}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/challenge/${row.challenge_id}`}
                    className="text-sm font-semibold hover:text-(--accent) transition-colors"
                  >
                    {displayTitle}
                  </Link>
                  {row.description && (
                    <div className="text-xs text-(--text-muted) mt-0.5 line-clamp-2">{row.description}</div>
                  )}
                  {row.title && (
                    <div className="text-xs text-(--text-muted) mt-0.5 opacity-60">#{row.challenge_id}</div>
                  )}
                  {lc.description && (
                    <div className="text-xs text-(--text-muted) mt-1">{lc.description}</div>
                  )}
                  {row.verdict_updated_at && (
                    <div className="text-xs text-(--text-muted) mt-0.5">
                      Updated {timeAgo(new Date(row.verdict_updated_at).getTime())}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`chip ${badgeClass}`}>{lc.label}</span>

                  {section === "claimable" && (
                    <button
                      className="next-step-cta cta-claim text-xs"
                      onClick={() => onClaim(row.challenge_id)}
                      disabled={isClaiming}
                      aria-busy={isClaiming ? "true" : "false"}
                    >
                      {isClaiming ? "Claiming…" : "Claim Reward"}
                    </button>
                  )}

                  {(section === "pending" || section === "lost" || section === "won") && (
                    <Link href={`/challenge/${row.challenge_id}`} className="btn btn-ghost btn-sm text-xs">
                      View →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function ClaimsPage() {
  const { address, isConnected } = useAccount();
  const [idInput, setIdInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiOut | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const fromUrl = useRef(false);

  // Load from ?id= if present
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qs = sp.get("id");
    if (qs && /^\d+$/.test(qs)) {
      fromUrl.current = true;
      setIdInput(qs);
      void load(qs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(idStr: string) {
    setErr(null);
    setLoading(true);
    try {
      const trimmed = String(idStr || "").trim();
      if (!/^\d+$/.test(trimmed)) throw new Error("Enter a numeric challenge ID");
      const res = await fetch(`/api/challenge/${trimmed}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `API error ${res.status}`);
      setData(j as ApiOut);
      const url = new URL(window.location.href);
      url.searchParams.set("id", trimmed);
      window.history.replaceState({}, "", url.toString());
      if (fromUrl.current) {
        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e: any) {
      setData(null);
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack-6">
      <Breadcrumb items={[{ label: "Claims" }]} />

      {/* Page header */}
      <div className="page-header">
        <h1 className="page-header__title">Claim Rewards</h1>
        <p className="page-header__sub mt-1">
          Your reward board — claimable winnings, pending finalization, and history.
        </p>
      </div>

      {/* Reward board (wallet-aware) */}
      {isConnected && address ? (
        <RewardBoard address={address} />
      ) : (
        <ConnectWalletGate message="Connect your wallet to see claimable rewards, pending finalization, and reward history." />
      )}

      {/* Manual lookup */}
      <section>
        <h2 className="label-text mb-3">Look up a challenge</h2>

        <div className="p-5 rounded-lg border bg-raised">
          <div className="stack-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="input sm:max-w-[280px]"
                placeholder="Challenge ID (e.g. 42)"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void load(idInput); }}
                inputMode="numeric"
              />
              <button
                className={`btn btn-primary ${loading ? "loading" : ""}`}
                onClick={() => void load(idInput)}
                disabled={loading}
                aria-busy={loading ? "true" : "false"}
              >
                {loading ? "Loading…" : "Load challenge"}
              </button>
              {data && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setIdInput(""); setErr(null); setData(null);
                    const url = new URL(window.location.href);
                    url.searchParams.delete("id");
                    window.history.replaceState({}, "", url.toString());
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {err && (
              <div className="alert-banner alert-banner--error">
                Error: {err}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Loaded challenge detail */}
      {data && (
        <section ref={detailRef}>
          <div className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-base font-semibold">
                  {data.title ?? `Challenge #${data.id}`}
                </div>
                {data.title && (
                  <div className="text-xs text-(--text-muted) mt-0.5">#{data.id}</div>
                )}
                {data.description && (
                  <p className="mt-2 text-sm text-(--text-muted) max-w-[78ch]">{data.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                  {data.creator && <span>Creator: {short(data.creator)}</span>}
                  {typeof data.winnersClaimed === "number" && (
                    <span>· {data.winnersClaimed} claimed</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0 items-center">
                <span className={`chip ${chipClassForStatus(data.status)}`}>{data.status}</span>
                {data.proofRequired && (
                  <span className={`chip ${data.proofOk ? "chip--ok" : "chip--info"}`}>
                    {data.proofOk ? "Proof OK" : "Proof required"}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-(--glass-border) flex items-center gap-4">
              <Link href={`/challenge/${data.id}`} className="next-step-cta">
                {data.status === "Finalized" ? "View & claim rewards →" : "View challenge details →"}
              </Link>
              <span className="text-xs text-(--text-muted)">
                {data.status === "Finalized"
                  ? "Claim actions are available on the challenge page."
                  : `Status: ${data.status}. Claims open after finalization.`}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
