"use client";

import { useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import type { Abi, Address, Hex } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { Chrome, Hero, Tabs, Panel } from "./components/ui";
import { GovernancePanel } from "./panels/GovernancePanel";
import { FeesPanel } from "./panels/FeesPanel";
import { ProofsPanel } from "./panels/ProofsPanel";
// ValidatorsPanel removed — V1 has no validator staking/voting
import { TokensPanel } from "./panels/TokensPanel";
import { ChallengesPanel } from "./panels/ChallengesPanel";
import { TreasuryPanel } from "./panels/TreasuryPanel";
import { RolesPanel } from "./panels/RolesPanel";
import { ModelsPanel } from "./panels/ModelsPanel";

type Tab =
  | "governance"
  | "fees"
  | "proofs"
  | "tokens"
  | "challenges"
  | "treasury"
  | "roles"
  | "models";

export default function AdminConsole() {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [toast, setToast] = useState<{ kind: "info" | "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("governance");

  const push = (text: string, kind: "info" | "ok" | "bad" = "info") => {
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

  /* ── READ — basics / status ── */
  const { data: adminAddr } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "admin",
  });

  const isAdmin =
    !!adminAddr && !!address && (adminAddr as string).toLowerCase() === address.toLowerCase();

  const { data: treasuryNative } = useBalance({
    address: ADDR.Treasury,
    query: { refetchInterval: 12_000, refetchOnWindowFocus: false },
  });

  // V1 contract reads — only fields that exist in ChallengePay V1
  const { data: globalPaused } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "globalPaused" });
  const { data: useTokenAllowlist } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "useTokenAllowlist" });
  const { data: minLeadTime } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "minLeadTime" });
  const { data: maxLeadTime } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "maxLeadTime" });
  const { data: proofTightenOnly } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "proofTightenOnly" });
  const { data: feeCaps } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "feeCaps" }) as { data?: { forfeitFeeMaxBps: bigint; cashbackMaxBps: bigint } };
  const { data: feeConfig } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "feeConfig" }) as { data?: { forfeitFeeBps: bigint; protocolBps: bigint; creatorBps: bigint; cashbackBps: bigint } };

  /* ── Guards ── */
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
        ]}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "governance", label: "Governance" },
          { key: "fees", label: "Fees" },
          { key: "proofs", label: "Proofs" },
          { key: "tokens", label: "Tokens" },
          { key: "challenges", label: "Challenges" },
          { key: "treasury", label: "Treasury" },
          { key: "roles", label: "Roles" },
          { key: "models", label: "Models & Templates" },
        ]}
      />

      {tab === "governance" && (
        <GovernancePanel
          values={{ globalPaused: !!globalPaused, minLeadTime: minLeadTime as bigint | undefined, maxLeadTime: maxLeadTime as bigint | undefined }}
          onWrite={cpWrite}
        />
      )}

      {tab === "fees" && (
        <FeesPanel
          caps={{ forfeit: feeCaps?.forfeitFeeMaxBps, cashback: feeCaps?.cashbackMaxBps }}
          cfg={{ forfeit: feeConfig?.forfeitFeeBps, protocol: feeConfig?.protocolBps, creator: feeConfig?.creatorBps, cashback: feeConfig?.cashbackBps }}
          onWrite={cpWrite}
        />
      )}

      {tab === "proofs" && (
        <ProofsPanel
          current={{ tightenOnly: !!proofTightenOnly }}
          onWrite={cpWrite}
        />
      )}

      {tab === "tokens" && (
        <TokensPanel current={{ useAllowlist: !!useTokenAllowlist }} onWrite={cpWrite} />
      )}

      {tab === "challenges" && <ChallengesPanel onWrite={cpWrite} />}
      {tab === "treasury" && <TreasuryPanel />}
      {tab === "roles" && <RolesPanel />}
      {tab === "models" && <ModelsPanel />}
    </Chrome>
  );
}
