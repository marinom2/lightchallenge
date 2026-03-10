// app/validators/components/Step2_ProvideContext.tsx
"use client";

import { motion } from "framer-motion";
import { Settings2 } from "lucide-react";
import SteamLinkButton from "@/app/components/SteamLinkButton";
import DotaCard, {
  DotaCardSkeleton,
  type DotaEvalPayload,
} from "@/app/components/dota/DotaCard";
import { useEffect, useRef, useState } from "react";
import type { UiModel, ModelParam } from "../types";

/* ──────────────────────────────────────────────────────────────── */
type SteamBinding =
  | {
      platform: "steam";
      wallet: `0x${string}`;
      platformId: string; // steam64
      handle: string | null;
      ts: number;
    }
  | null;

interface Props {
  selectedModel: UiModel | null;
  challengeId: string;
  onChallengeIdChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  params: Record<string, any>;
  onParamChange: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  wallet?: `0x${string}` | undefined;
  steamBinding: SteamBinding;
  steamLoading: boolean;
}

/* ──────────────────────────────────────────────────────────────── */
function ParamInput({
  param,
  value,
  onChange,
  inputId,
}: {
  param: ModelParam;
  value: any;
  onChange: (next: any) => void;
  inputId?: string;
}) {
  switch (param.type) {
    case "datetime":
      return (
        <input
          id={inputId}
          type="datetime-local"
          className="input"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "date":
      return (
        <input
          id={inputId}
          type="date"
          className="input"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "int":
    case "number":
      return (
        <input
          id={inputId}
          type="number"
          className="input"
          value={value ?? ""}
          inputMode="numeric"
          step={param.type === "int" ? 1 : "any"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return onChange("");
            const n = Number(v);
            onChange(Number.isNaN(n) ? "" : n);
          }}
        />
      );
    case "bool":
      return (
        <label
          htmlFor={inputId}
          className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 cursor-pointer"
        >
          <input
            id={inputId}
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-sm">{param.label}</span>
        </label>
      );
    default:
      return (
        <input
          id={inputId}
          type="text"
          className="input"
          placeholder={param.placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/* ──────────────────────────────────────────────────────────────── */
export default function Step2_ProvideContext({
  selectedModel,
  challengeId,
  onChallengeIdChange,
  subject,
  onSubjectChange,
  params,
  onParamChange,
  wallet,
  steamBinding,
  steamLoading,
}: Props) {
  const [dotaCard, setDotaCard] = useState<DotaEvalPayload | null>(null);
  const [dotaCardError, setDotaCardError] = useState<string | null>(null);
  const wantsSteam = !!selectedModel?.providers?.includes("steam");
  const abortRef = useRef<AbortController | null>(null);

  /* Load Dota card if Steam linked (abortable) */
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      if (!wantsSteam || !steamBinding?.platformId) {
        setDotaCard(null);
        setDotaCardError(null);
        return;
      }
      try {
        setDotaCard(null);
        setDotaCardError(null);
        const r = await fetch(
          `/api/platforms/dota2/card?steam64=${steamBinding.platformId}`,
          { cache: "no-store", signal: ctrl.signal }
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to fetch Dota card");
        setDotaCard(j as DotaEvalPayload);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setDotaCardError(e?.message || "Failed to load Dota card");
      }
    })();

    return () => ctrl.abort();
  }, [wantsSteam, steamBinding?.platformId]);

  if (!selectedModel) {
    return <div className="empty">Go back and choose a model in Step 1.</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold">Provide Context</h2>
        <p className="mt-2 text-[color:var(--text-muted)]">
          Set the subject and any parameters required by{" "}
          <span className="text-[color:var(--text)]">{selectedModel.name}</span>.
        </p>
      </div>

      {/* Challenge & Subject */}
      <div className="panel">
        <div className="panel-header">Challenge &amp; Subject</div>
        <div className="panel-body grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="challengeId"
              className="text-sm text-[color:var(--text-muted)]"
            >
              Challenge ID
            </label>
            <input
              id="challengeId"
              value={challengeId}
              onChange={(e) => onChallengeIdChange(e.target.value)}
              className="input"
              placeholder="e.g., 12345"
            />
          </div>
          <div>
            <label
              htmlFor="subjectAddr"
              className="text-sm text-[color:var(--text-muted)]"
            >
              Subject Wallet Address
            </label>
            <div className="flex gap-2">
              <input
                id="subjectAddr"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                className="input font-mono"
                placeholder="0x..."
              />
              {!!wallet && (
                <button
                  type="button"
                  onClick={() => onSubjectChange(wallet)}
                  className="btn btn-ghost whitespace-nowrap px-3 py-2"
                  aria-label="Use connected wallet address"
                >
                  Use Connected
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Steam binding (if required) */}
      {wantsSteam && (
        <div className="panel">
          <div className="panel-header">Linked Account: Steam</div>
          <div className="panel-body">
            {steamLoading && (
              <div className="text-sm text-[color:var(--text-muted)]">
                Checking Steam link…
              </div>
            )}
            {!steamLoading && !steamBinding && (
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[color:var(--text-muted)]">
                  No Steam account linked yet.
                </div>
                <SteamLinkButton subject={wallet} />
              </div>
            )}
            {!steamLoading && steamBinding && (
              <div className="space-y-3">
                <div className="text-sm text-[color:var(--text-muted)]">
                  Linked as{" "}
                  <span className="font-semibold text-[color:var(--text)]">
                    {steamBinding.handle ?? `Steam #${steamBinding.platformId}`}
                  </span>
                </div>
                {!dotaCard && !dotaCardError && <DotaCardSkeleton />}
                {dotaCardError && (
                  <div className="tone-warn text-sm">{dotaCardError}</div>
                )}
                {dotaCard && <DotaCard data={dotaCard} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model Parameters */}
      {selectedModel.params && selectedModel.params.length > 0 && (
        <div className="panel">
          <div className="panel-header flex items-center gap-2">
            <Settings2 className="size-4" />
            Model Parameters
          </div>
          <div className="panel-body grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedModel.params.map((param) => (
              <div key={param.key}>
                {param.type !== "bool" && (
                  <label
                    htmlFor={`param-${param.key}`}
                    className="text-sm text-[color:var(--text-muted)]"
                  >
                    {param.label}
                  </label>
                )}
                <ParamInput
                  param={param}
                  value={params[param.key]}
                  inputId={`param-${param.key}`}
                  onChange={(v) =>
                    onParamChange((prev) => ({ ...prev, [param.key]: v }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}