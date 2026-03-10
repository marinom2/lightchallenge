"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import type { Abi, Address, Hex, Log } from "viem";
import {
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  toBytes,
} from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { getAllCodeTemplates, toPlain } from "@/lib/templates";

/* ──────────────────────────────────────────────────────────────── */
/* Utilities                                                       */
/* ──────────────────────────────────────────────────────────────── */
const ZERO: Address = "0x0000000000000000000000000000000000000000";

const OPERATOR_ROLE = keccak256(toBytes("OPERATOR_ROLE"));
const SWEEPER_ROLE  = keccak256(toBytes("SWEEPER_ROLE"));

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const okAddr = (a?: string) => {
  try { return a && isAddress(a) ? getAddress(a) : undefined; } catch { return undefined; }
};
const toBigintOrZero = (v: string) => {
  try { return BigInt(v || "0"); } catch { return 0n; }
};
const cn = (...x: (string|false|undefined)[]) => x.filter(Boolean).join(" ");

const AUTO_POI_VERIFIER: string | undefined = ADDR.ChallengePayAivmPoiVerifier;

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function aivmHashFromId(id: string): `0x${string}` {
  return keccak256(toBytes(id.trim())) as `0x${string}`;
}
const addrRegex = /^0x[a-fA-F0-9]{40}$/;
const bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
const pretty = (o: any) => { try { return JSON.stringify(o, null, 2); } catch { return ""; } };
const parseJSON = <T=any>(s: string): T | null => { try { return JSON.parse(s) as T; } catch { return null; } };

/* ──────────────────────────────────────────────────────────────── */
/* Core Admin Page (Tabbed)                                        */
/* ──────────────────────────────────────────────────────────────── */
export default function AdminConsole() {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [toast, setToast] = useState<{ kind: "info"|"ok"|"bad"; text: string }|null>(null);
  const [busy, setBusy]   = useState<string | null>(null);

  const push = (text: string, kind: "info"|"ok"|"bad" = "info") => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3600);
  };

  const waitReceipt = async (hash: Hex) => {
    if (!pc) return;
    setBusy("Waiting for confirmation…");
    await pc.waitForTransactionReceipt({ hash });
    setBusy(null);
  };

  const cpWrite = async (fn: string, args: any[], successMsg: string) => {
    try {
      setBusy("Sending transaction…");
      const tx = await writeContractAsync({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay as Abi,
        functionName: fn as any,
        args,
      });
      await waitReceipt(tx);
      push(successMsg, "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Transaction failed", "bad");
    }
  };

  /* ──────────────────────────────────────────────────────────────
     READ — basics / status
     ────────────────────────────────────────────────────────────── */
  const { data: adminAddr } = useReadContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "admin",
  });

  const isAdmin =
    !!adminAddr && !!address && (adminAddr as string).toLowerCase() === address.toLowerCase();

  const { data: treasuryNative } = useBalance({
    address: ADDR.Treasury,
    query: { refetchInterval: 12_000, refetchOnWindowFocus: false },
  });

  const { data: globalPaused } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "globalPaused",
  });
  const { data: useTokenAllowlist } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "useTokenAllowlist",
  });
  const { data: minLeadTime } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "minLeadTime",
  });
  const { data: maxLeadTime } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "maxLeadTime",
  });
  const { data: fastTrackVerifier } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "fastTrackVerifier",
  });
  const { data: proofTightenOnly } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "proofTightenOnly",
  });

  const { data: minValidatorStake } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "minValidatorStake",
  });
  const { data: approvalThresholdBps } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "approvalThresholdBps",
  });
  const { data: quorumBps } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "quorumBps",
  });
  const { data: unstakeCooldownSec } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "unstakeCooldownSec",
  });

  const { data: feeCaps } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "feeCaps",
  }) as { data?: { forfeitFeeMaxBps: bigint; charityMaxBps: bigint; cashbackMaxBps: bigint } };

  const { data: feeConfig } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "feeConfig",
  }) as {
    data?: {
      forfeitFeeBps: bigint; protocolBps: bigint; creatorBps: bigint; validatorsBps: bigint;
      rejectFeeBps: bigint; rejectValidatorsBps: bigint; cashbackBps: bigint;
    };
  };

  const { data: maxVotersPerChallenge } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "maxVotersPerChallenge",
  });

  /* ──────────────────────────────────────────────────────────────
     Guards
     ────────────────────────────────────────────────────────────── */
  if (!address) {
    return (
      <Chrome>
        <Hero />
        <Panel title="Admin Console">
          <div className="p-6 text-sm">Connect a wallet to access the Admin Console.</div>
        </Panel>
      </Chrome>
    );
  }
  if (!isAdmin) {
    return (
      <Chrome>
        <Hero />
        <Panel title="Admin Console">
          <div className="p-6 text-sm">403 — This wallet is not the ChallengePay admin.</div>
        </Panel>
      </Chrome>
    );
  }

  /* ──────────────────────────────────────────────────────────────
     Tabs
     ────────────────────────────────────────────────────────────── */
  type Tab =
    | "governance"
    | "fees"
    | "proofs"
    | "validators"
    | "tokens"
    | "challenges"
    | "treasury"
    | "roles"
    | "models";

  const [tab, setTab] = useState<Tab>("governance");

  return (
    <Chrome toast={toast} busy={busy}>
      <Hero
        items={[
          { label: "ChallengePay", value: ADDR.ChallengePay },
          { label: "Treasury", value: ADDR.Treasury },
          { label: "Admin", value: adminAddr as Address },
        ]}
        right={[
          <div key="native" className="rounded-xl border p-3">
            <div className="text-xs opacity-70">Treasury Native</div>
            <div className="font-semibold">
              {treasuryNative ? `${treasuryNative.formatted} ${treasuryNative.symbol}` : "—"}
            </div>
          </div>,
          <div key="maxv" className="rounded-xl border p-3">
            <div className="text-xs opacity-70">Max voters/challenge</div>
            <div className="font-semibold">
              {maxVotersPerChallenge !== undefined ? String(maxVotersPerChallenge) : "—"}
            </div>
          </div>,
        ]}
      />

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "governance", label: "Governance" },
            { key: "fees", label: "Fees" },
            { key: "proofs", label: "Proofs" },
            { key: "validators", label: "Validators" },
            { key: "tokens", label: "Tokens" },
            { key: "challenges", label: "Challenges" },
            { key: "treasury", label: "Treasury" },
            { key: "roles", label: "Roles" },
            { key: "models", label: "Models & Templates" }, 
          ]}
        />

      {tab === "governance" && (
        <GovernancePanel
          values={{
            globalPaused: !!globalPaused,
            minLeadTime: minLeadTime as bigint | undefined,
            maxLeadTime: maxLeadTime as bigint | undefined,
          }}
          onWrite={cpWrite}
        />
      )}

      {tab === "fees" && (
        <FeesPanel
          caps={{
            forfeit: feeCaps?.forfeitFeeMaxBps,
            charity: feeCaps?.charityMaxBps, // ← charityMaxBps shown and set here
            cashback: feeCaps?.cashbackMaxBps,
          }}
          cfg={{
            forfeit: feeConfig?.forfeitFeeBps,
            protocol: feeConfig?.protocolBps,
            creator: feeConfig?.creatorBps,
            validators: feeConfig?.validatorsBps,
            reject: feeConfig?.rejectFeeBps,
            rejectValidators: feeConfig?.rejectValidatorsBps,
            cashback: feeConfig?.cashbackBps,
          }}
          onWrite={cpWrite}
        />
      )}

      {tab === "proofs" && (
        <ProofsPanel
          current={{
            tightenOnly: !!proofTightenOnly,
            fastTrack: fastTrackVerifier as Address | undefined,
          }}
          onWrite={cpWrite}
        />
      )}

      {tab === "models" && <ModelsPanel />}

      {tab === "validators" && (
        <ValidatorsPanel
          current={{
            minStake: minValidatorStake as bigint | undefined,
            thresholdBps: approvalThresholdBps as bigint | undefined,
            quorumBps: quorumBps as bigint | undefined,
            cooldownSec: unstakeCooldownSec as bigint | undefined,
            maxVoters: maxVotersPerChallenge as bigint | undefined,
          }}
          onWrite={cpWrite}
        />
      )}

      {tab === "tokens" && (
        <TokensPanel
          current={{
            useAllowlist: !!useTokenAllowlist,
          }}
          onWrite={cpWrite}
        />
      )}

      {tab === "challenges" && (
        <ChallengesPanel onWrite={cpWrite} />
      )}

      {tab === "treasury" && (
        <TreasuryPanel />
      )}

      {tab === "roles" && (
        <RolesPanel />
      )}
    </Chrome>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/* Panels                                                          */
/* ──────────────────────────────────────────────────────────────── */

function GovernancePanel({
  values,
  onWrite,
}: {
  values: { globalPaused?: boolean; minLeadTime?: bigint; maxLeadTime?: bigint };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [newAdmin, setNewAdmin] = useState("");
  const [paused, setPaused] = useState<boolean>(!!values.globalPaused);
  const [leadMin, setLeadMin] = useState(values.minLeadTime ? String(values.minLeadTime) : "");
  const [leadMax, setLeadMax] = useState(values.maxLeadTime ? String(values.maxLeadTime) : "");

  useEffect(() => {
    setPaused(!!values.globalPaused);
    if (values.minLeadTime) setLeadMin(String(values.minLeadTime));
    if (values.maxLeadTime) setLeadMax(String(values.maxLeadTime));
  }, [values.globalPaused, values.minLeadTime, values.maxLeadTime]);

  const doSetAdmin = async () => {
    const a = okAddr(newAdmin); if (!a) return;
    await onWrite("setAdmin", [a], "Admin updated");
  };
  const doPauseAll = async () => {
    await onWrite("pauseAll", [paused], paused ? "Global paused" : "Global unpaused");
  };
  const doSetLeadBounds = async () => {
    const min = toBigintOrZero(leadMin);
    const max = toBigintOrZero(leadMax);
    if (min === 0n || max < min) return;
    await onWrite("setLeadTimeBounds", [min, max], "Lead time bounds updated");
  };

  return (
    <Panel title="Governance">
      <Card title="Ownership">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70 mb-1">New admin (0x…)</div>
            <input className="input" value={newAdmin} onChange={(e)=>setNewAdmin(e.target.value)} placeholder="0x…" />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button className="btn btn-primary" onClick={doSetAdmin}>Transfer Admin</button>
          </div>
        </div>
      </Card>

      <Card title="Global Pause">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <button className={seg(paused)} onClick={()=>setPaused(true)}>Paused</button>
            <button className={seg(!paused)} onClick={()=>setPaused(false)}>Unpaused</button>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button className="btn btn-warn" onClick={doPauseAll}>Apply</button>
          </div>
        </div>
      </Card>

      <Card title="Lead Time Bounds (seconds)">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70 mb-1">Min</div>
            <input className="input" value={leadMin} onChange={(e)=>setLeadMin(e.target.value)} />
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Max</div>
            <input className="input" value={leadMax} onChange={(e)=>setLeadMax(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetLeadBounds}>Save</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function FeesPanel({
  caps,
  cfg,
  onWrite,
}: {
  caps: { forfeit?: bigint; charity?: bigint; cashback?: bigint };
  cfg: {
    forfeit?: bigint; protocol?: bigint; creator?: bigint; validators?: bigint;
    reject?: bigint; rejectValidators?: bigint; cashback?: bigint;
  };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  // Caps — includes charityMaxBps (what you asked to be able to set)
  const [capForfeit, setCapForfeit] = useState(caps.forfeit ? String(caps.forfeit) : "");
  const [capCharity, setCapCharity] = useState(caps.charity ? String(caps.charity) : "");
  const [capCashback, setCapCashback] = useState(caps.cashback ? String(caps.cashback) : "");

  useEffect(() => {
    if (caps.forfeit !== undefined) setCapForfeit(String(caps.forfeit));
    if (caps.charity !== undefined) setCapCharity(String(caps.charity));
    if (caps.cashback !== undefined) setCapCashback(String(caps.cashback));
  }, [caps.forfeit, caps.charity, caps.cashback]);

  const doSetFeeCaps = async () => {
    const f = Number(capForfeit || "0");
    const c = Number(capCharity || "0");   // ← charityMaxBps
    const b = Number(capCashback || "0");
    if ([f, c, b].some(v => !Number.isFinite(v) || v < 0 || v > 10_000)) return;
    await onWrite("setFeeCaps", [{ forfeitFeeMaxBps: f, charityMaxBps: c, cashbackMaxBps: b }], "Fee caps updated");
  };

  // Config
  const [forfeit, setForfeit] = useState(cfg.forfeit ? String(cfg.forfeit) : "");
  const [protocol, setProtocol] = useState(cfg.protocol ? String(cfg.protocol) : "");
  const [creator, setCreator] = useState(cfg.creator ? String(cfg.creator) : "");
  const [validators, setValidators] = useState(cfg.validators ? String(cfg.validators) : "");
  const [reject, setReject] = useState(cfg.reject ? String(cfg.reject) : "");
  const [rejectValidators, setRejectValidators] = useState(cfg.rejectValidators ? String(cfg.rejectValidators) : "");
  const [cashback, setCashback] = useState(cfg.cashback ? String(cfg.cashback) : "");

  useEffect(() => {
    if (cfg.forfeit !== undefined) setForfeit(String(cfg.forfeit));
    if (cfg.protocol !== undefined) setProtocol(String(cfg.protocol));
    if (cfg.creator !== undefined) setCreator(String(cfg.creator));
    if (cfg.validators !== undefined) setValidators(String(cfg.validators));
    if (cfg.reject !== undefined) setReject(String(cfg.reject));
    if (cfg.rejectValidators !== undefined) setRejectValidators(String(cfg.rejectValidators));
    if (cfg.cashback !== undefined) setCashback(String(cfg.cashback));
  }, [cfg]);

  const doSetFeeConfig = async () => {
    const f = Number(forfeit || "0");
    const p = Number(protocol || "0");
    const cr= Number(creator || "0");
    const v = Number(validators || "0");
    const r = Number(reject || "0");
    const rv= Number(rejectValidators || "0");
    const cb= Number(cashback || "0");
    if ([f, p, cr, v, r, rv, cb].some(x => !Number.isFinite(x) || x < 0 || x > 10_000)) return;
    if (p + cr + v !== f) return;                   // protocol+creator+validators must equal forfeit
    if (rv > r) return;                             // rejectValidators ≤ reject
    await onWrite("setFeeConfig", [{
      forfeitFeeBps: f, protocolBps: p, creatorBps: cr, validatorsBps: v,
      rejectFeeBps: r, rejectValidatorsBps: rv, cashbackBps: cb,
    }], "Fee config updated");
  };

  return (
    <Panel title="Fees">
      <Card title="Caps (bps)">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Forfeit Max">
            <input className="input" value={capForfeit} onChange={(e)=>setCapForfeit(e.target.value)} />
          </Field>
          <Field label="Charity Max">
            <input className="input" value={capCharity} onChange={(e)=>setCapCharity(e.target.value)} />
          </Field>
          <Field label="Cashback Max">
            <input className="input" value={capCashback} onChange={(e)=>setCapCashback(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetFeeCaps}>Save Caps</button>
          </div>
        </div>
      </Card>

      <Card title="Configuration (bps)">
        <div className="grid gap-3 sm:grid-cols-7">
          <Field label="Forfeit"><input className="input" value={forfeit} onChange={(e)=>setForfeit(e.target.value)} /></Field>
          <Field label="Protocol"><input className="input" value={protocol} onChange={(e)=>setProtocol(e.target.value)} /></Field>
          <Field label="Creator"><input className="input" value={creator} onChange={(e)=>setCreator(e.target.value)} /></Field>
          <Field label="Validators"><input className="input" value={validators} onChange={(e)=>setValidators(e.target.value)} /></Field>
          <Field label="Reject"><input className="input" value={reject} onChange={(e)=>setReject(e.target.value)} /></Field>
          <Field label="Reject Validators"><input className="input" value={rejectValidators} onChange={(e)=>setRejectValidators(e.target.value)} /></Field>
          <Field label="Cashback"><input className="input" value={cashback} onChange={(e)=>setCashback(e.target.value)} /></Field>
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={doSetFeeConfig}>Save Config</button>
        </div>
      </Card>
    </Panel>
  );
}

function ProofsPanel({
  current,
  onWrite,
}: {
  current: { tightenOnly?: boolean; fastTrack?: Address };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [tight, setTight] = useState<boolean>(!!current.tightenOnly);
  const [verifier, setVerifier] = useState<string>(current.fastTrack ?? "");

  useEffect(() => {
    setTight(!!current.tightenOnly);
    setVerifier(current.fastTrack ?? "");
  }, [current.tightenOnly, current.fastTrack]);

  const doTight = async () => {
    await onWrite("setProofTightenOnly", [tight], tight ? "Tighten-only ON" : "Tighten-only OFF");
  };
  const doFastTrack = async () => {
    const a = okAddr(verifier) || ZERO;
    await onWrite("setFastTrackVerifier", [a], "Fast-track verifier set");
  };

  return (
    <Panel title="Proofs & Fast-Track">
      <Card title="Tighten-Only Proofs">
        <div className="flex items-center gap-2">
          <button className={seg(tight)} onClick={()=>setTight(true)}>ON</button>
          <button className={seg(!tight)} onClick={()=>setTight(false)}>OFF</button>
          <button className="btn btn-primary ml-auto" onClick={doTight}>Apply</button>
        </div>
      </Card>

      <Card title="Fast-Track Verifier">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Verifier (0x…)">
            <input className="input" value={verifier} onChange={(e)=>setVerifier(e.target.value)} placeholder="0x…" />
          </Field>
          <div className="sm:col-span-2 flex items-end">
            <button className="btn btn-primary" onClick={doFastTrack}>Set Verifier</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function ValidatorsPanel({
  current,
  onWrite,
}: {
  current: {
    minStake?: bigint;
    thresholdBps?: bigint;
    quorumBps?: bigint;
    cooldownSec?: bigint;
    maxVoters?: bigint;
  };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [minStake, setMinStake] = useState(current.minStake ? formatUnits(current.minStake, 18) : "");
  const [thr, setThr] = useState(current.thresholdBps ? String(current.thresholdBps) : "");
  const [qrm, setQrm] = useState(current.quorumBps ? String(current.quorumBps) : "");
  const [cool, setCool] = useState(current.cooldownSec ? String(current.cooldownSec) : "");
  const [maxVoters, setMaxVoters] = useState(current.maxVoters ? String(current.maxVoters) : "");

  useEffect(() => {
    if (current.minStake !== undefined) setMinStake(formatUnits(current.minStake, 18));
    if (current.thresholdBps !== undefined) setThr(String(current.thresholdBps));
    if (current.quorumBps !== undefined) setQrm(String(current.quorumBps));
    if (current.cooldownSec !== undefined) setCool(String(current.cooldownSec));
    if (current.maxVoters !== undefined) setMaxVoters(String(current.maxVoters));
  }, [current]);

  const doSetValidatorParams = async () => {
    try {
      const stake = parseUnits(minStake || "0", 18);
      const t = Number(thr || "0");
      const q = Number(qrm || "0");
      const c = toBigintOrZero(cool || "0");
      if (!Number.isFinite(t) || t < 0 || t > 10_000) return;
      if (!Number.isFinite(q) || q < 0 || q > 10_000) return;
      await onWrite("setValidatorParams", [stake, BigInt(t), BigInt(q), c], "Validator params updated");
    } catch {/* invalid stake */}
  };
  const doSetMaxVoters = async () => {
    const n = Number(maxVoters || "0");
    if (!Number.isInteger(n) || n < 10 || n > 4_294_967_295) return;
    await onWrite("setMaxVotersPerChallenge", [BigInt(n)], "Max voters updated");
  };

  return (
    <Panel title="Validators">
      <Card title="Parameters">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Min Stake (LCAI)">
            <input className="input" value={minStake} onChange={(e)=>setMinStake(e.target.value)} />
          </Field>
          <Field label="Approval Threshold (bps)">
            <input className="input" value={thr} onChange={(e)=>setThr(e.target.value)} />
          </Field>
          <Field label="Quorum (bps)">
            <input className="input" value={qrm} onChange={(e)=>setQrm(e.target.value)} />
          </Field>
          <Field label="Unstake Cooldown (sec)">
            <input className="input" value={cool} onChange={(e)=>setCool(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={doSetValidatorParams}>Save Validator Params</button>
        </div>
      </Card>

      <Card title="Cap: Voters per Challenge">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max (≥ 10)">
            <input className="input" value={maxVoters} onChange={(e)=>setMaxVoters(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex items-end">
            <button className="btn btn-primary" onClick={doSetMaxVoters}>Save Cap</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function TokensPanel({
  current,
  onWrite,
}: {
  current: { useAllowlist?: boolean };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState<boolean>(!!current.useAllowlist);
  const [tokenAddr, setTokenAddr] = useState("");
  const [flag, setFlag] = useState<boolean>(true);

  useEffect(() => setEnabled(!!current.useAllowlist), [current.useAllowlist]);

  const doToggle = async () => {
    await onWrite("setUseTokenAllowlist", [enabled], enabled ? "Allowlist enabled" : "Allowlist disabled");
  };
  const doSetToken = async () => {
    const t = okAddr(tokenAddr); if (!t) return;
    await onWrite("setTokenAllowed", [t, flag], flag ? "Token allowed" : "Token disallowed");
  };

  return (
    <Panel title="Token Allowlist">
      <Card title="Global Allowlist">
        <div className="flex items-center gap-2">
          <button className={seg(enabled)} onClick={()=>setEnabled(true)}>Enabled</button>
          <button className={seg(!enabled)} onClick={()=>setEnabled(false)}>Disabled</button>
          <button className="btn btn-primary ml-auto" onClick={doToggle}>Save</button>
        </div>
      </Card>

      <Card title="Allow / Disallow Token">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Token (0x…)">
            <input className="input" value={tokenAddr} onChange={(e)=>setTokenAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <div className="flex items-end gap-2">
            <button className={seg(flag)} onClick={()=>setFlag(true)}>Allow</button>
            <button className={seg(!flag)} onClick={()=>setFlag(false)}>Disallow</button>
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetToken}>Apply</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function ChallengesPanel({
  onWrite,
}: {
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [paused, setPaused] = useState(false);

  const [vcId, setVcId] = useState("");
  const [vcReq, setVcReq] = useState(false);
  const [vcVerifier, setVcVerifier] = useState("");
  const [vcProofDeadline, setVcProofDeadline] = useState("");
  const [vcPeerDeadline, setVcPeerDeadline] = useState("");

  const doPause = async () => {
    const bid = toBigintOrZero(id); if (bid === 0n) return;
    await onWrite("pauseChallenge", [bid, paused], paused ? "Challenge paused" : "Challenge unpaused");
  };
  const doCancel = async () => {
    const bid = toBigintOrZero(id); if (bid === 0n) return;
    await onWrite("cancelChallenge", [bid], "Challenge canceled");
  };
  const doVC = async () => {
    const bid = toBigintOrZero(vcId); if (bid === 0n) return;
    const ver = vcVerifier ? (okAddr(vcVerifier) || ZERO) : ZERO;
    const proofD = toBigintOrZero(vcProofDeadline || "0");
    const peerD  = toBigintOrZero(vcPeerDeadline || "0");
    await onWrite("setVerificationConfig", [bid, vcReq, ver, proofD, peerD], "Verification config set");
  };

  return (
    <Panel title="Challenges">
      <Card title="Pause / Cancel">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Challenge ID">
            <input className="input" value={id} onChange={(e)=>setId(e.target.value)} placeholder="id" />
          </Field>
          <div className="flex items-end gap-2">
            <button className={seg(paused)} onClick={()=>setPaused(true)}>Paused</button>
            <button className={seg(!paused)} onClick={()=>setPaused(false)}>Unpaused</button>
          </div>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary" onClick={doPause}>Apply Pause</button>
            <button className="btn btn-warn" onClick={doCancel}>Cancel</button>
          </div>
        </div>
      </Card>

      <Card title="Verification Config (per challenge)">
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Challenge ID">
            <input className="input" value={vcId} onChange={(e)=>setVcId(e.target.value)} />
          </Field>
          <Field label="Proof Required">
            <div className="flex gap-2">
              <button className={seg(vcReq)} onClick={()=>setVcReq(true)}>Yes</button>
              <button className={seg(!vcReq)} onClick={()=>setVcReq(false)}>No</button>
            </div>
          </Field>
          <Field label="Verifier (0x…)">
            <input className="input" value={vcVerifier} onChange={(e)=>setVcVerifier(e.target.value)} />
          </Field>
          <Field label="Proof Deadline (unix sec)">
            <input className="input" value={vcProofDeadline} onChange={(e)=>setVcProofDeadline(e.target.value)} />
          </Field>
          <Field label="Peer Deadline (unix sec)">
            <input className="input" value={vcPeerDeadline} onChange={(e)=>setVcPeerDeadline(e.target.value)} />
          </Field>
          <div className="sm:col-span-5">
            <button className="btn btn-primary" onClick={doVC}>Set Verification Config</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function TreasuryPanel() {
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();

  const [toast, setToast] = useState<{ kind: "info"|"ok"|"bad"; text: string }|null>(null);
  const [busy, setBusy]   = useState<string | null>(null);
  const push = (text: string, kind: "info"|"ok"|"bad" = "info") => {
    setToast({ kind, text }); setTimeout(() => setToast(null), 3600);
  };
  const waitReceipt = async (hash: Hex) => {
    if (!pc) return;
    setBusy("Waiting for confirmation…");
    await pc.waitForTransactionReceipt({ hash });
    setBusy(null);
  };

  // local token tracker
  const TOKENS_KEY = "lc.admin.tokens";
  const [tokenList, setTokenList] = useState<Address[]>([]);
  const [newToken, setNewToken] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const clean = arr
      .filter((v): v is Address => isAddress(v))
      .map(getAddress);
      setTokenList(clean);
    } catch { setTokenList([]); }
  }, []);
  const saveTokens = (next: Address[]) => {
    setTokenList(next);
    try { localStorage.setItem(TOKENS_KEY, JSON.stringify(next)); } catch {}
  };

  const ERC20_ABI = ABI.ERC20 as Abi;
  const [erc20, setErc20] = useState<Array<{ addr: Address; symbol: string; decimals: number; balance: bigint }>>([]);
  useEffect(() => {
    let stop = false;
    (async () => {
      if (!pc || tokenList.length === 0) { setErc20([]); return; }
      const out: Array<{ addr: Address; symbol: string; decimals: number; balance: bigint }> = [];
      for (const t of tokenList) {
        try {
          const [dec, sym, bal] = await Promise.all([
            pc.readContract({ address: t, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>,
            pc.readContract({ address: t, abi: ERC20_ABI, functionName: "symbol"   }) as Promise<string>,
            pc.readContract({ address: t, abi: ERC20_ABI, functionName: "balanceOf", args: [ADDR.Treasury] }) as Promise<bigint>,
          ]);
          out.push({ addr: t, symbol: sym, decimals: Number(dec), balance: bal });
        } catch {/* ignore */}
      }
      if (!stop) setErc20(out);
    })();
    return () => { stop = true; };
  }, [pc, tokenList]);

  // grants
  const [grantToken, setGrantToken] = useState<Address | "">("");
  const [grantTo, setGrantTo] = useState("");
  const [grantAmt, setGrantAmt] = useState("");

  const doGrant = async () => {
    const token = grantToken ? getAddress(grantToken) : undefined;
    const to = okAddr(grantTo);
    if (!token || !to) return push("Enter token & recipient", "bad");
    const meta = erc20.find(x => x.addr.toLowerCase() === token.toLowerCase());
    const dec = meta?.decimals ?? 18;
    let amt: bigint;
    try { amt = parseUnits(grantAmt || "0", dec); } catch { return push("Invalid amount", "bad"); }
    try {
      setBusy("Sending transaction…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "grantERC20",
        args: [token, to, amt],
      });
      await waitReceipt(tx);
      push("Grant sent", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Grant failed", "bad");
    }
  };

  // sweep
  const [sweepKind, setSweepKind] = useState<"native" | Address>("native");
  const [sweepTo, setSweepTo]     = useState("");
  const [sweepAmt, setSweepAmt]   = useState("");

  const doSweep = async () => {
    const to = okAddr(sweepTo); if (!to) return push("Enter recipient", "bad");
    const isNative = sweepKind === "native";
    const tokenAddr = isNative ? ZERO : (sweepKind as Address);
    const meta = isNative ? undefined : erc20.find(x => x.addr.toLowerCase() === tokenAddr.toLowerCase());
    const dec = isNative ? 18 : (meta?.decimals ?? 18);
    let amt: bigint;
    try { amt = parseUnits(sweepAmt || "0", dec); } catch { return push("Invalid amount", "bad"); }

    try {
      setBusy("Sending transaction…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "sweep",
        args: [tokenAddr, to, amt],
      });
      await waitReceipt(tx);
      push("Sweep complete", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Sweep failed", "bad");
    }
  };

  // Allowance viewer (event reconstruction)
  const [scanBlocks, setScanBlocks] = useState<number>(120_000);
  const [allowances, setAllowances] = useState<{ token: Address | "native"; recipient: Address; amount: bigint }[]>([]);
  const scanAllowances = async () => {
    if (!pc) return;
    try {
      const current = await pc.getBlockNumber();
      const from = current - BigInt(Math.max(1_000, scanBlocks));
      const to = current;

      const tGrant20 = keccak256(toBytes("GrantERC20(address,address,uint256,address)"));
      const tGrantETH = keccak256(toBytes("GrantETH(address,uint256,address)"));
      const tClaim20 = keccak256(toBytes("ClaimedERC20(address,address,uint256)"));
      const tClaimETH = keccak256(toBytes("ClaimedETH(address,uint256)"));
      const tDepFor  = keccak256(toBytes("ReceivedERC20For(address,address,address,uint256)"));

      const logs = await pc.getLogs({ address: ADDR.Treasury, fromBlock: from, toBlock: to });

      const map = new Map<string, bigint>();
      const add = (k: string, v: bigint) => map.set(k, (map.get(k) ?? 0n) + v);
      const sub = (k: string, v: bigint) => map.set(k, (map.get(k) ?? 0n) - v);

      for (const l of logs as readonly Log[]) {
        const sig = (l.topics?.[0] ?? "") as Hex;
        const dataAmt = l.data && l.data !== "0x" ? BigInt(l.data as Hex) : 0n;

        if (sig === tGrant20 && l.topics.length >= 4) {
          const token = ("0x" + l.topics[1]!.slice(26)) as Address;
          const toR   = ("0x" + l.topics[2]!.slice(26)) as Address;
          add(`${token}|${toR}`, dataAmt);
        } else if (sig === tGrantETH && l.topics.length >= 3) {
          const toR = ("0x" + l.topics[1]!.slice(26)) as Address;
          add(`native|${toR}`, dataAmt);
        } else if (sig === tClaim20 && l.topics.length >= 3) {
          const token = ("0x" + l.topics[1]!.slice(26)) as Address;
          const toR   = ("0x" + l.topics[2]!.slice(26)) as Address;
          sub(`${token}|${toR}`, dataAmt);
        } else if (sig === tClaimETH && l.topics.length >= 2) {
          const toR = ("0x" + l.topics[1]!.slice(26)) as Address;
          sub(`native|${toR}`, dataAmt);
        } else if (sig === tDepFor && l.topics.length >= 4) {
          const token      = ("0x" + l.topics[1]!.slice(26)) as Address;
          const creditedTo = ("0x" + l.topics[3]!.slice(26)) as Address;
          add(`${token}|${creditedTo}`, dataAmt);
        }
      }

      const rows: { token: Address | "native"; recipient: Address; amount: bigint }[] = [];
      for (const [k, v] of map) {
        if (v <= 0n) continue;
        const [tokenStr, who] = k.split("|");
        rows.push({
          token: tokenStr === "native" ? "native" : (tokenStr as Address),
          recipient: who as Address,
          amount: v,
        });
      }
      setAllowances(rows);
      push(`Scanned ~${scanBlocks.toLocaleString()} blocks → ${rows.length} active allowances`, "ok");
    } catch (e: any) {
      push(e?.shortMessage || e?.message || "Scan failed", "bad");
    }
  };

  return (
    <Panel title="Treasury">
      {toast && <Toast kind={toast.kind} text={toast.text} />}
      {busy && <Busy text={busy} />}

      <Card title="Tracked Tokens">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Add ERC-20 address (0x…)" value={newToken} onChange={(e)=>setNewToken(e.target.value)} />
          <button
            className="btn btn-ghost"
            onClick={() => {
              const a = okAddr(newToken);
              if (!a) return push("Enter a valid ERC-20 address", "bad");
              if (tokenList.some(t => t.toLowerCase() === a.toLowerCase())) return push("Already added", "bad");
              saveTokens([a, ...tokenList]); setNewToken("");
            }}
          >
            Add
          </button>
        </div>

        {erc20.length === 0 ? (
          <div className="empty mt-3">No tokens tracked. Add an ERC-20 above.</div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="table table--compact" style={{ minWidth: 720 }}>
              <thead>
              <tr><th>Token</th><th>Symbol</th><th>Decimals</th><th>Treasury Balance</th><th/></tr>
              </thead>
              <tbody>
              {erc20.map((t) => (
                <tr key={t.addr}>
                  <td className="mono">
                    <Link className="link" href={`https://testnet.lightscan.app/address/${t.addr}`} target="_blank">
                      {t.addr}
                    </Link>
                  </td>
                  <td>{t.symbol}</td>
                  <td>{t.decimals}</td>
                  <td>{formatUnits(t.balance, t.decimals)}</td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => saveTokens(tokenList.filter((x) => x.toLowerCase() !== t.addr.toLowerCase()))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Grant ERC-20 Allowance">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70 mb-1">Token</div>
            <select className="input" value={grantToken || ""} onChange={(e)=>setGrantToken(e.target.value ? getAddress(e.target.value as Address) : "")}>
              <option value="">— select token —</option>
              {erc20.map((t)=>(
                <option key={t.addr} value={t.addr}>{t.symbol} — {short(t.addr)}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Recipient (0x…)</div>
            <input className="input" value={grantTo} onChange={(e)=>setGrantTo(e.target.value)} placeholder="0x…" />
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Amount (tokens)</div>
            <input className="input" value={grantAmt} onChange={(e)=>setGrantAmt(e.target.value)} placeholder="0.0" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-primary" onClick={doGrant}>Grant</button>
          </div>
        </div>
      </Card>

      <Card title="Sweep Funds">
        <div className="flex flex-wrap gap-2">
          <button className={seg(sweepKind === "native")} onClick={()=>setSweepKind("native")}>Native</button>
          {erc20.map((t)=>(
            <button key={t.addr} className={seg(sweepKind === t.addr)} onClick={()=>setSweepKind(t.addr)}>
              {t.symbol}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          <Field label="Recipient (0x…)"><input className="input" value={sweepTo} onChange={(e)=>setSweepTo(e.target.value)} /></Field>
          <Field label="Amount"><input className="input" value={sweepAmt} onChange={(e)=>setSweepAmt(e.target.value)} /></Field>
          <div className="flex items-end">
            <button className="btn btn-warn" onClick={doSweep}>Sweep</button>
          </div>
        </div>
      </Card>

      <Card title="Allowance Viewer">
        <div className="flex items-center gap-2">
          <input className="input w-36" type="number" min={1000} step={1000} value={scanBlocks} onChange={(e)=>setScanBlocks(Number(e.target.value))} />
          <button className="btn btn-ghost" onClick={scanAllowances}>Scan</button>
        </div>
        {allowances.length === 0 ? (
          <div className="empty mt-3">Run a scan to reconstruct recent allowances.</div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="table table--compact" style={{ minWidth: 880 }}>
              <thead><tr><th>Token</th><th>Symbol</th><th>Recipient</th><th>Allowance</th></tr></thead>
              <tbody>
              {allowances.map((row, i) => {
                const isNative = row.token === "native";
                const meta = !isNative ? erc20.find(t => t.addr.toLowerCase() === (row.token as Address).toLowerCase()) : undefined;
                const sym = isNative ? "LCAI" : (meta?.symbol ?? "ERC20");
                const dec = isNative ? 18 : (meta?.decimals ?? 18);
                return (
                  <tr key={`${row.token}-${row.recipient}-${i}`}>
                    <td className="mono">{isNative ? <span className="chip chip--info">Native</span> : short(row.token as string)}</td>
                    <td>{sym}</td>
                    <td className="mono">{row.recipient}</td>
                    <td>{formatUnits(row.amount, dec)}</td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Panel>
  );
}

function RolesPanel() {
  const { writeContractAsync } = useWriteContract();
  const pc = usePublicClient();
  const [toast, setToast] = useState<{ kind: "info"|"ok"|"bad"; text: string }|null>(null);
  const [busy, setBusy]   = useState<string | null>(null);
  const push = (text: string, kind: "info"|"ok"|"bad" = "info") => { setToast({ kind, text }); setTimeout(()=>setToast(null), 3600); };
  const waitReceipt = async (hash: Hex) => { if (!pc) return; setBusy("Waiting…"); await pc.waitForTransactionReceipt({ hash }); setBusy(null); };

  const [roleAddr, setRoleAddr] = useState("");
  const [role, setRole] = useState<"operator"|"sweeper">("operator");
  const roleId = role === "operator" ? OPERATOR_ROLE : SWEEPER_ROLE;

  const targetAddr = okAddr(roleAddr) ?? ZERO;
  const { data: hasRole } = useReadContract({
    address: ADDR.Treasury,
    abi: ABI.Treasury,
    functionName: "hasRole",
    args: [roleId, targetAddr],
    query: { enabled: targetAddr !== ZERO },
  } as any);

  const doGrant = async () => {
    const who = okAddr(roleAddr); if (!who) return;
    try {
      setBusy("Sending…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "grantRole",
        args: [roleId, who],
      });
      await waitReceipt(tx);
      push("Role granted", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Grant role failed", "bad");
    }
  };
  const doRevoke = async () => {
    const who = okAddr(roleAddr); if (!who) return;
    try {
      setBusy("Sending…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "revokeRole",
        args: [roleId, who],
      });
      await waitReceipt(tx);
      push("Role revoked", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Revoke role failed", "bad");
    }
  };

  return (
    <Panel title="Roles">
      {toast && <Toast kind={toast.kind} text={toast.text} />}
      {busy && <Busy text={busy} />}

      <Card title="Treasury Roles">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Role">
            <div className="segmented">
              <button className={seg(role === "operator")} onClick={()=>setRole("operator")}>Operator</button>
              <button className={seg(role === "sweeper")} onClick={()=>setRole("sweeper")}>Sweeper</button>
            </div>
          </Field>
          <Field label="Address (0x…)">
            <input className="input" value={roleAddr} onChange={(e)=>setRoleAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <div className="flex items-end gap-2">
            <span className={cn("chip", hasRole ? "chip--ok" : "chip--bad")}>{hasRole ? "Has role" : "Not granted"}</span>
            <button className="btn btn-primary" onClick={doGrant}>Grant</button>
            <button className="btn btn-ghost" onClick={doRevoke}>Revoke</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function ModelsPanel() {
  type ModelKind = "aivm" | "custom";
  type ModelParam = { key: string; label: string; type: "int"|"text"|"datetime"; default?: number|string };

  type ModelRow = {
    id: string;
    label: string;
    kind: ModelKind;
    modelHash: string;
    verifier: string;
    binding?: boolean;
    signals?: string[];
    params?: ModelParam[];
    sources?: string[];
    fileAccept?: string[];
    notes?: string;
  };

  type TemplateField =
    | { kind: "number"; key: string; label: string; min?: number; step?: number; default?: number }
    | { kind: "text"; key: string; label: string; default?: string }
    | { kind: "readonly"; key: string; label: string; value: string }
    | { kind: "select"; key: string; label: string; options: { value: string; label: string }[]; default?: string };

  type TemplateRow = {
    id: string;
    kind: "steps" | "running" | "dota" | "cs" | "lol";
    name: string;
    hint?: string;
    modelId: string;
    fields: TemplateField[];
  };

  const [tab, setTab] = useState<"models"|"templates">("models");
  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("lc.admin.key") ?? ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("lc.admin.key", adminKey); } catch {} }, [adminKey]);

  /* ── MODELS state ─────────────────────────────────────────────────────── */
  const [mText, setMText] = useState<string>('{"models": []}');
  const [mValid, setMValid] = useState<string | null>(null);
  const [mStatus, setMStatus] = useState<string | null>(null);
  const mInitial = useRef<string>('{"models": []}');

  // quick-form
  const [mId, setMId] = useState("");
  const [mLabel, setMLabel] = useState("");
  const [mKind, setMKind] = useState<ModelKind>("aivm");
  const [mHash, setMHash] = useState("");
  const [mVerifier, setMVerifier] = useState("");
  const [mBinding, setMBinding] = useState(true);
  const [mSignals, setMSignals] = useState("bind, success");
  const [mSources, setMSources] = useState("");
  const [mFileAccept, setMFileAccept] = useState("");
  const [mNotes, setMNotes] = useState("");
  const [mParams, setMParams] = useState<ModelParam[]>([]);
  const addParam = () => setMParams(p => [...p, { key: "", label: "", type: "int" }]);
  const delParam = (i: number) => setMParams(p => p.filter((_,idx)=>idx!==i));
  const setParam = (i: number, patch: Partial<ModelParam>) =>
    setMParams(p => p.map((row,idx)=> idx===i ? { ...row, ...patch } : row));

  // load current file
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/templates", { cache: "no-store" });
        const j = await res.json();
        let arr: TemplateRow[] = Array.isArray(j) ? j : (j?.templates ?? []);

        // Fallback to code-side defaults if admin file is empty
        if (!arr.length) {
          arr = getAllCodeTemplates().map(toPlain) as unknown as TemplateRow[];
        }

        const txt = pretty(arr);
        mInitial.current = txt; setMText(txt); setMValid("OK");
        try { localStorage.setItem("models.json", txt); } catch {}
      } catch {
        setMText('{"models": []}'); setMValid("Load error");
      }
    })();
  }, []);

  // live validate models
  useEffect(() => {
    const obj = parseJSON<{ models: ModelRow[] }>(mText);
    if (!obj) return setMValid("Invalid JSON");
    if (!obj.models || !Array.isArray(obj.models)) return setMValid("Top-level must be { models: [] }");
    for (const m of obj.models) {
      if (!m?.id || !m?.label) return setMValid("Each model needs id+label");
      if (!["aivm", "custom"].includes(m.kind)) {
        return setMValid("kind must be aivm/custom");
      }
      if (!bytes32Regex.test(m.modelHash)) {
        return setMValid("modelHash must be 32-byte 0x hex");
      }
      if (!addrRegex.test(m.verifier)) {
        return setMValid("verifier must be 0x address");
      }
      if (m.params && !Array.isArray(m.params)) return setMValid("params must be array");
      if (m.signals && !Array.isArray(m.signals)) return setMValid("signals must be array");
      if (m.sources && !Array.isArray(m.sources)) return setMValid("sources must be array");
      if (m.fileAccept && !Array.isArray(m.fileAccept)) return setMValid("fileAccept must be array");
    }
    setMValid("OK");
  }, [mText]);

  useEffect(() => {
    if (mKind === "aivm") {
      setMHash(mId.trim() ? aivmHashFromId(mId.trim()) : "");
      setMVerifier(AUTO_POI_VERIFIER ?? mVerifier);
    }
  }, [mId, mKind]);

  const insertModel = () => {
    if (!mId.trim() || !mLabel.trim()) return setMStatus("Enter id & label");
    const signals = mSignals.split(",").map(s=>s.trim()).filter(Boolean);
    const sources = mSources.split(",").map(s=>s.trim()).filter(Boolean);
    const fileAccept = mFileAccept.split(",").map(s=>s.trim()).filter(Boolean);
    const entry: ModelRow = {
      id: mId.trim(),
      label: mLabel.trim(),
      kind: mKind,
      modelHash: mKind === "aivm" ? aivmHashFromId(mId.trim()) : mHash.trim(),
      verifier: (mKind === "aivm" ? (AUTO_POI_VERIFIER || mVerifier) : mVerifier) || mVerifier,
      ...(mBinding ? { binding: true } : {}),
      ...(signals.length ? { signals } : {}),
      ...(mParams.length ? { params: mParams.filter((p) => p.key && p.label) } : {}),
      ...(sources.length ? { sources } : {}),
      ...(fileAccept.length ? { fileAccept } : {}),
      ...(mNotes.trim() ? { notes: mNotes.trim() } : {}),
    };
    const base = parseJSON<{ models: ModelRow[] }>(mText) || { models: [] };
    const idx = base.models.findIndex(x => x.id === entry.id);
    if (idx >= 0) base.models[idx] = entry; else base.models.push(entry);
    const txt = pretty(base); setMText(txt); setMStatus("Model inserted (not yet saved) ✅");
    try { localStorage.setItem("models.json", txt); } catch {}
  };

  const saveModels = async () => {
    if (mValid !== "OK") return setMStatus("Fix errors before saving");
    setMStatus("Saving…");
    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(adminKey ? {"x-admin-key": adminKey} : {}) },
        body: mText,
      });
      const j = await res.json();
      if (j.ok) { setMStatus(`Saved ✅ (${j.count} models)`); mInitial.current = mText; }
      else setMStatus(j.error || "Save failed");
    } catch (e: any) {
      setMStatus(e?.message || "Save failed");
    }
  };

  // on-chain register (AIVM)
  const { writeContractAsync } = useWriteContract();
  const pc = usePublicClient();
  const waitTx = async (hash: Hex) => { if (!pc) return; await pc.waitForTransactionReceipt({ hash }); };

  const registerOnChain = async () => {
    if (mKind === "aivm") {
      setMStatus(
        "No separate on-chain model allowlist step is used anymore. " +
        "AIVM + PoI now resolves through ChallengePayAivmPoiVerifier and your deployed pipeline."
      );
      return;
    }
  
    setMStatus("Custom kind saved locally. No default on-chain action.");
  };
  /* ── TEMPLATES state (top-level array) ─────────────────────────────────── */
  const [tText, setTText] = useState<string>("[]");
  const [tValid, setTValid] = useState<string | null>(null);
  const [tStatus, setTStatus] = useState<string | null>(null);
  const tInitial = useRef<string>("[]");

  // quick-form
  const [selId, setSelId] = useState("");
  const [tId, setTId] = useState("");
  const [tKind, setTKind] = useState<TemplateRow["kind"]>("dota");
  const [tName, setTName] = useState("");
  const [tModelId, setTModelId] = useState("");
  const [tHint, setTHint] = useState("");
  const [tFields, setTFields] = useState<TemplateField[]>([]);
  const addField = (kind: TemplateField["kind"] = "number") => {
    const base: any =
      kind === "number" ? { kind, key: "", label: "", min: 0, step: 1 } :
      kind === "text"   ? { kind, key: "", label: "", default: "" } :
      kind === "readonly" ? { kind, key: "", label: "", value: "" } :
      { kind: "select", key: "", label: "", options: [], default: "" };
    setTFields(f => [...f, base]);
  };

  // load templates
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/templates", { cache: "no-store" });
        const j = await res.json();
        const arr: TemplateRow[] = Array.isArray(j) ? j : (j?.templates ?? []);
        const txt = pretty(arr);
        tInitial.current = txt; setTText(txt); setTValid("OK");
        try { localStorage.setItem("templates.json", txt); } catch {}
      } catch {
        setTText("[]"); setTValid("Load error");
      }
    })();
  }, []);

  // validate templates
  useEffect(() => {
    const arr = parseJSON<TemplateRow[]>(tText);
    if (!arr) return setTValid("Invalid JSON");
    if (!Array.isArray(arr)) return setTValid("Top-level must be an array");
    for (const t of arr) {
      if (!t?.id) return setTValid("Each template needs id");
      if (!["steps","running","dota","cs","lol"].includes(t.kind)) return setTValid(`Invalid kind on ${t.id}`);
      if (!t.name) return setTValid(`Template ${t.id} needs name`);
      if (!t.modelId) return setTValid(`Template ${t.id} needs modelId`);
      if (!Array.isArray(t.fields)) return setTValid(`Template ${t.id} fields must be array`);
      for (const f of t.fields) {
        const k = (f as any).kind;
        if (!["number","text","readonly","select"].includes(k)) return setTValid(`Bad field kind ${k}`);
        if (k === "select" && !Array.isArray((f as any).options)) return setTValid(`select.options must be array`);
      }
    }
    setTValid("OK");
  }, [tText]);

  const listTemplates = useMemo(() => parseJSON<TemplateRow[]>(tText) ?? [], [tText]);
  const loadIntoForm = (id: string) => {
    const t = listTemplates.find(x=>x.id===id); if (!t) return;
    setSelId(id); setTId(t.id); setTKind(t.kind); setTName(t.name); setTModelId(t.modelId);
    setTHint(t.hint ?? ""); setTFields(t.fields ?? []);
  };

  const upsertTemplate = () => {
    if (!tId.trim() || !tName.trim() || !tModelId.trim()) return setTStatus("Fill id/name/modelId");
    const entry: TemplateRow = { id: tId.trim(), kind: tKind, name: tName.trim(), modelId: tModelId.trim(), hint: tHint.trim() || undefined, fields: tFields };
    const base = listTemplates.slice();
    const idx = base.findIndex(x=>x.id===entry.id);
    if (idx>=0) base[idx]=entry; else base.push(entry);
    const txt = pretty(base); setTText(txt); setTStatus(idx>=0 ? "Updated (not yet saved) ✅" : "Added (not yet saved) ✅");
    try { localStorage.setItem("templates.json", txt); } catch {}
    setSelId(entry.id);
  };

  const delTemplate = () => {
    if (!selId) return;
    const base = listTemplates.filter(x=>x.id!==selId);
    const txt = pretty(base); setTText(txt); setTStatus(`Deleted ${selId} (not yet saved) ✅`); setSelId("");
    try { localStorage.setItem("templates.json", txt); } catch {}
  };

  const saveTemplates = async () => {
    if (tValid !== "OK") return setTStatus("Fix errors before saving");
    setTStatus("Saving…");
    try {
      const res = await fetch("/api/admin/templates", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(adminKey ? {"x-admin-key": adminKey} : {}) },
        body: tText, // top-level array
      });
      const j = await res.json();
      if (j.ok) { setTStatus(`Saved ✅ (${j.count} templates)`); tInitial.current = tText; }
      else setTStatus(j.error || "Save failed");
    } catch (e:any) { setTStatus(e?.message || "Save failed"); }
  };

  /* ── UI ────────────────────────────────────────────────────────────────── */
  return (
    <Panel title="Models & Templates">
      {/* Mini-tabs */}
      <div className="flex flex-wrap gap-2">
        <button className={seg(tab==="models")} onClick={()=>setTab("models")}>Models</button>
        <button className={seg(tab==="templates")} onClick={()=>setTab("templates")}>Templates</button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="text-xs opacity-70">Admin Key</div>
          <input className="input w-64" placeholder="x-admin-key (optional)" value={adminKey} onChange={(e)=>setAdminKey(e.target.value)} />
        </div>
      </div>

      {tab==="models" ? (
        <>
          {/* Quick form */}
          <Card title="Add / Update a Model">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Model ID"><input className="input" value={mId} onChange={(e)=>setMId(e.target.value)} placeholder="e.g. cycling.distance_in_window@1" /></Field>
              <Field label="Label"><input className="input" value={mLabel} onChange={(e)=>setMLabel(e.target.value)} placeholder="Human label" /></Field>

              <Field label="Kind">
                <select className="input" value={mKind} onChange={(e)=>setMKind(e.target.value as ModelKind)}>
                  <option value="aivm">aivm</option>
                  <option value="custom">custom</option>
                </select>
              </Field>

              <Field label="Binding?">
                <div className="flex gap-2">
                  <button className={seg(mBinding)} onClick={()=>setMBinding(true)}>Yes</button>
                  <button className={seg(!mBinding)} onClick={()=>setMBinding(false)}>No</button>
                </div>
              </Field>

              <Field label="modelHash">
                <input className="input font-mono" value={mHash} onChange={(e)=>setMHash(e.target.value)} placeholder="0x…" />
                <div className="text-xs opacity-70 mt-1">
                  {mKind==="aivm" ? <span className="chip chip--info">auto · keccak(id)</span> : <span className="chip">manual</span>}
                </div>
              </Field>

              <Field label="verifier">
                <input className="input font-mono" value={mVerifier} onChange={(e)=>setMVerifier(e.target.value)} placeholder="0x…" />
                <div className="flex gap-2 items-center mt-1">
                  <button
                    type="button"
                    className="chip chip--info"
                    disabled={mKind !== "aivm" || !AUTO_POI_VERIFIER}
                    onClick={() => setMVerifier(AUTO_POI_VERIFIER || "")}
                    title="Use auto verifier"
                  >
                    use ChallengePayAivmPoiVerifier
                  </button>
                </div>
              </Field>

              <Field label="Signals (comma)"><input className="input" value={mSignals} onChange={(e)=>setMSignals(e.target.value)} placeholder="bind, success"/></Field>
              <Field label="Sources (comma)"><input className="input" value={mSources} onChange={(e)=>setMSources(e.target.value)} placeholder="apple_health:zip, opendota:api"/></Field>
              <Field label="File Accept (comma)"><input className="input" value={mFileAccept} onChange={(e)=>setMFileAccept(e.target.value)} placeholder=".zip, .json, .gpx"/></Field>
              <Field label="Notes (optional)"><input className="input" value={mNotes} onChange={(e)=>setMNotes(e.target.value)} placeholder="Any extra notes"/></Field>
            </div>

            {/* Params table */}
            <div className="space-y-2 mt-3">
              <div className="text-xs opacity-80">Params (optional)</div>
              {mParams.length===0 ? (
                <div className="empty">No params yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table--compact" style={{ minWidth: 720 }}>
                    <thead><tr><th>key</th><th>label</th><th>type</th><th>default</th><th/></tr></thead>
                    <tbody>
                      {mParams.map((p,i)=>(
                        <tr key={i}>
                          <td><input className="input" value={p.key} onChange={(e)=>setParam(i,{key:e.target.value})} placeholder="start_ts"/></td>
                          <td><input className="input" value={p.label} onChange={(e)=>setParam(i,{label:e.target.value})} placeholder="Start (UTC)"/></td>
                          <td>
                            <select className="input" value={p.type} onChange={(e)=>setParam(i,{type: e.target.value as ModelParam["type"]})}>
                              <option value="int">int</option>
                              <option value="text">text</option>
                              <option value="datetime">datetime</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className="input"
                              value={(p.default as any as string) ?? ""}
                              onChange={(e)=>{
                                const raw=e.target.value;
                                if (p.type==="int") {
                                  const v = raw.trim()==="" ? "" : Number.isFinite(Number(raw)) ? Number(raw) : p.default ?? "";
                                  setParam(i,{default: v as any});
                                } else setParam(i,{default: raw});
                              }}
                              placeholder="(optional)"
                            />
                          </td>
                          <td className="text-right"><button className="btn btn-ghost" onClick={()=>delParam(i)}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button className="btn btn-ghost" onClick={addParam}>+ Add Param</button>
            </div>

            <div className="flex gap-2 mt-3">
              <button className="btn btn-primary" onClick={insertModel}>Insert / Update</button>
              <button className="btn btn-ghost" onClick={registerOnChain}>
                Check on-chain step
              </button>
              {mKind === "custom" && !bytes32Regex.test(mHash) && (
                <div className="text-xs opacity-70">Custom models require a valid modelHash.</div>
              )}
            </div>
          </Card>

          {/* Raw models editor */}
          <textarea
            className="input font-mono"
            rows={18}
            value={mText}
            onChange={(e)=>{ setMText(e.target.value); try{ localStorage.setItem("models.json", e.target.value);}catch{} }}
            spellCheck={false}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={saveModels} disabled={mValid!=="OK"}>Save</button>
            <button className="btn btn-ghost" onClick={()=>setMText(mInitial.current)} disabled={mText===mInitial.current}>Revert</button>
          </div>
          {mStatus && <div className="text-xs opacity-80">{mStatus}</div>}
        </>
      ) : (
        <>
          {/* Templates quick editor */}
          <Card title="Templates (UI Catalog)">
            <div className="grid gap-2 sm:grid-cols-5">
              <Field label="Existing">
                <select className="input" value={selId} onChange={(e)=>loadIntoForm(e.target.value)}>
                  <option value="">— pick a template —</option>
                  {listTemplates.map((t)=>(
                    <option key={t.id} value={t.id}>{t.id} • {t.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Template ID"><input className="input" value={tId} onChange={(e)=>setTId(e.target.value)} placeholder="lol_winrate_next_n"/></Field>
              <Field label="Kind">
                <select className="input" value={tKind} onChange={(e)=>setTKind(e.target.value as TemplateRow["kind"])}>
                  <option value="steps">steps</option>
                  <option value="running">running</option>
                  <option value="dota">dota</option>
                  <option value="cs">cs</option>
                  <option value="lol">lol</option>
                </select>
              </Field>
              <Field label="Name"><input className="input" value={tName} onChange={(e)=>setTName(e.target.value)} placeholder="Win Rate • Next N"/></Field>
              <Field label="Model ID"><input className="input" value={tModelId} onChange={(e)=>setTModelId(e.target.value)} placeholder="lol.winrate_next_n@1"/></Field>
              <Field label="Hint (optional)"><input className="input" value={tHint} onChange={(e)=>setTHint(e.target.value)} placeholder="Short hint"/></Field>
            </div>

            {/* Fields editor */}
            <div className="space-y-2 mt-3">
              <div className="text-xs opacity-80">Fields</div>
              {tFields.length===0 ? (
                <div className="empty">No fields yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table--compact" style={{ minWidth: 920 }}>
                    <thead><tr><th>kind</th><th>key</th><th>label</th><th>extras</th><th/></tr></thead>
                    <tbody>
                      {tFields.map((f,i)=>{
                        const kind = f.kind;
                        return (
                          <tr key={i}>
                            <td>
                              <select
                                className="input"
                                value={kind}
                                onChange={(e)=>{
                                  const k = e.target.value as TemplateField["kind"];
                                  const base: any =
                                    k==="number"?{kind:k,key:(f as any).key??"",label:(f as any).label??"",min:0,step:1}:
                                    k==="text"?{kind:k,key:(f as any).key??"",label:(f as any).label??"",default:""}:
                                    k==="readonly"?{kind:k,key:(f as any).key??"",label:(f as any).label??"",value:""}:
                                    {kind:"select",key:(f as any).key??"",label:(f as any).label??"",options:[],default:""};
                                  setTFields(rows => rows.map((r,idx)=> idx===i ? base : r));
                                }}
                              >
                                <option value="number">number</option>
                                <option value="text">text</option>
                                <option value="readonly">readonly</option>
                                <option value="select">select</option>
                              </select>
                            </td>
                            <td><input className="input" value={(f as any).key??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, key:e.target.value} as any) : r))}/></td>
                            <td><input className="input" value={(f as any).label??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, label:e.target.value} as any) : r))}/></td>
                            <td>
                              {kind==="number" && (
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <input className="input" placeholder="min" value={(f as any).min??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, min:Number(e.target.value)} as any) : r))}/>
                                  <input className="input" placeholder="step" value={(f as any).step??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, step:Number(e.target.value)} as any) : r))}/>
                                  <input className="input" placeholder="default" value={(f as any).default??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, default:Number(e.target.value)} as any) : r))}/>
                                </div>
                              )}
                              {kind==="text" && (
                                <input className="input" placeholder="default" value={(f as any).default??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, default:e.target.value} as any) : r))}/>
                              )}
                              {kind==="readonly" && (
                                <input className="input" placeholder="value" value={(f as any).value??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, value:e.target.value} as any) : r))}/>
                              )}
                              {kind==="select" && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <textarea
                                    className="input font-mono" rows={3}
                                    placeholder='options as JSON: [{"value":"ranked","label":"Ranked"}]'
                                    value={JSON.stringify((f as any).options ?? [], null, 0)}
                                    onChange={(e)=>{
                                      const parsed = parseJSON<{value:string;label:string}[]>(e.target.value) || [];
                                      setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, options: parsed} as any) : r));
                                    }}
                                  />
                                  <input className="input" placeholder="default" value={(f as any).default??""} onChange={(e)=>setTFields(rows=>rows.map((r,idx)=> idx===i ? ({...r, default:e.target.value} as any) : r))}/>
                                </div>
                              )}
                            </td>
                            <td className="text-right"><button className="btn btn-ghost" onClick={()=>setTFields(rows=>rows.filter((_,idx)=>idx!==i))}>Remove</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" onClick={()=>addField("number")}>+ number</button>
                <button className="btn btn-ghost" onClick={()=>addField("text")}>+ text</button>
                <button className="btn btn-ghost" onClick={()=>addField("select")}>+ select</button>
                <button className="btn btn-ghost" onClick={()=>addField("readonly")}>+ readonly</button>
              </div>

              <div className="flex gap-2 mt-2">
                <button className="btn btn-primary" onClick={upsertTemplate}>Insert / Update</button>
                <button className="btn btn-ghost" onClick={delTemplate} disabled={!selId}>Delete Selected</button>
              </div>
            </div>
          </Card>

          {/* Raw templates editor */}
          <textarea
            className="input font-mono"
            rows={16}
            value={tText}
            onChange={(e)=>{ setTText(e.target.value); try{ localStorage.setItem("templates.json", e.target.value);}catch{} }}
            spellCheck={false}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={saveTemplates} disabled={tValid!=="OK"}>Save</button>
            <button className="btn btn-ghost" onClick={()=>setTText(tInitial.current)} disabled={tText===tInitial.current}>Revert</button>
          </div>
          {tStatus && <div className="text-xs opacity-80">{tStatus}</div>}
        </>
      )}
    </Panel>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/* UI Atoms                                                        */
/* ──────────────────────────────────────────────────────────────── */

function Chrome({
  children,
  toast,
  busy,
}: {
  children: React.ReactNode;
  toast?: { kind: "info"|"ok"|"bad"; text: string } | null;
  busy?: string | null;
}) {
  return (
    <div className="space-y-8">
      {toast && <Toast kind={toast.kind} text={toast.text} />}
      {busy && <Busy text={busy} />}
      {children}
    </div>
  );
}

function Hero({
  items = [],
  right = [],
}: {
  items?: { label: string; value?: string }[];
  right?: React.ReactNode[];
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="font-semibold">Admin Console</div>
      </div>
      <div className="panel-body grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {items.map((x, i) => (
          <div key={i} className="rounded-xl border p-3">
            <div className="opacity-70">{x.label}</div>
            {x.value ? (
              <Link className="mono link break-all" target="_blank" href={`https://testnet.lightscan.app/address/${x.value}`}>
                {x.value}
              </Link>
            ) : (
              <div className="mono">—</div>
            )}
          </div>
        ))}
        {right}
      </div>
    </section>
  );
}

function Tabs({
  value, onChange, items,
}: {
  value: string;
  onChange: (k: any) => void;
  items: { key: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <button
          key={t.key}
          className={cn("pill-toggle", value === t.key && "is-active")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="font-semibold">{title}</div>
      </div>
      <div className="panel-body space-y-4">{children}</div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs opacity-70 mb-1">{label}</div>
      {children}
    </div>
  );
}

function Toast({ kind, text }: { kind: "info"|"ok"|"bad"; text: string }) {
  return (
    <div className={cn("toast", kind === "ok" && "toast--ok", kind === "bad" && "toast--bad")}>
      {text}
    </div>
  );
}
function Busy({ text }: { text: string }) {
  return (
    <div className="toast toast--info">{text}</div>
  );
}
function seg(active: boolean) {
  return cn("pill-toggle", active && "is-active");
}