"use client";

import * as React from "react";
import { ExternalLink, Copy, AlertTriangle } from "lucide-react";

import type { ChallengeFormState, DerivedState } from "../../state/types";
import type { ChainPolicyHints } from "../../lib/chainRulesLoader";

import ReviewCard from "../ReviewCard";
import { Callout } from "../ui/Callout";
import { useToasts } from "@/lib/ui/toast";
import { EXPLORER_URL } from "@/lib/contracts";

type Hex = `0x${string}`;

async function copySafe(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Step4_Review(props: {
  state: ChallengeFormState;
  derived: DerivedState;
  policyHints: ChainPolicyHints | null;
  nativeBalanceFormatted?: string;
  creating: boolean;
  txHash: Hex | null;
  canCreate: boolean;
  onCreate: () => Promise<void>;
}) {
  const { push } = useToasts();

  const errors = React.useMemo(() => Object.values(props.derived.errors), [props.derived.errors]);
  const hasErrors = errors.length > 0;

  const tokenAllowBlocked =
    props.policyHints?.allowlistEnabled === true &&
    props.policyHints?.tokenAllowed === false;

  const policyIssues = [
    props.policyHints?.paused ? "Protocol is paused." : null,
    tokenAllowBlocked ? "Selected ERC20 token is not allowed by the on-chain allowlist." : null,
  ].filter(Boolean) as string[];

  const openTx = () => {
    if (!props.txHash) return;
    const base = EXPLORER_URL.replace(/\/$/, "");
    window.open(`${base}/tx/${props.txHash}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <ReviewCard
        state={props.state}
        derived={props.derived}
        policyHints={props.policyHints}
      />

      {hasErrors ? (
        <Callout tone="warn" title="Fix before creating">
          <ul className="mt-2 space-y-1">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5" />
                <span className="text-sm">{e}</span>
              </li>
            ))}
          </ul>
        </Callout>
      ) : (
        <Callout tone="ok" title="Looks good">
          Your config is structurally valid. Review the policy checks below and create when ready.
        </Callout>
      )}

      {policyIssues.length > 0 ? (
        <Callout tone="warn" title="Chain policy issues">
          <ul className="mt-2 space-y-1">
            {policyIssues.map((issue, i) => (
              <li key={i} className="text-sm">
                {issue}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <div className="panel p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Ready to submit</div>
            <div className="text-xs text-(--text-muted)">
              This sends a wallet transaction calling <span className="font-mono">createChallenge</span>.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!props.txHash}
              onClick={async () => {
                if (!props.txHash) return;
                const ok = await copySafe(props.txHash);
                push(ok ? "Tx hash copied" : "Could not copy tx hash");
              }}
            >
              <Copy size={16} />
              Copy tx
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              disabled={!props.txHash}
              onClick={openTx}
            >
              <ExternalLink size={16} />
              Explorer
            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={!props.canCreate || props.creating}
              onClick={props.onCreate}
              title={!props.canCreate ? "Fix the issues above before creating." : undefined}
            >
              {props.creating ? "Processing…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}