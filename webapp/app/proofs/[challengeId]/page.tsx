// app/proofs/[challengeId]/page.tsx
// Challenge-centric proof page — all metadata from DB, proof path from VCE.
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { isHex } from "viem";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  ShieldCheck, ArrowLeft, Trophy, Upload, Smartphone,
  FileUp, AlertTriangle, CheckCircle, ExternalLink, Loader2, ChevronDown,
} from "lucide-react";

import { useProofCapability } from "../hooks/useProofCapability";
import SubmissionResult, { type SubmissionState } from "../components/SubmissionResult";
import {
  FITNESS_PROVIDERS,
  type FitnessProvider,
  getDefaultFitnessProvider,
  setDefaultFitnessProvider,
} from "@/lib/fitnessProviders";

const QrHandoff = dynamic(() => import("../components/QrHandoff"), { ssr: false });

/* ── Types ────────────────────────────────────────────────────────── */
type ChallengeMeta = {
  title: string;
  description: string;
  category: string;
  modelHash: string | null;
  modelKind: string | null;
  modelId: string | null;
  params: any;
  proof: any | null;
  game: string | null;
  tags: string[];
};

/* ── Helpers ───────────────────────────────────────────────────────── */
const is0x = (v: unknown): v is `0x${string}` =>
  typeof v === "string" && isHex(v);

function formatModelName(modelId?: string | null): string | null {
  if (!modelId) return null;
  const base = modelId.split("@")[0] ?? modelId;
  return base.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseRuleHint(params: any): string | null {
  if (params === null || params === undefined) return null;
  let obj: any = null;
  if (typeof params === "string") {
    try { obj = JSON.parse(params); } catch { /* semicolon format below */ }
  } else if (Array.isArray(params)) {
    return null;
  } else if (typeof params === "object") {
    obj = params;
  }
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const parts: string[] = [];
    const r = obj.rule ?? obj;
    if (r.minSteps) parts.push(`${Number(r.minSteps).toLocaleString()} steps`);
    if (r.minDistance || r.min_distance_m) parts.push(`${Number(r.minDistance || r.min_distance_m).toLocaleString()}m distance`);
    if (r.days) parts.push(`${r.days} days`);
    if (r.minWins) parts.push(`${r.minWins} wins`);
    if (r.minKills) parts.push(`${r.minKills} kills`);
    if (r.matches) parts.push(`${r.matches} matches`);
    return parts.length ? parts.join(", ") : null;
  }
  const raw = typeof params === "string" ? params : null;
  if (!raw) return null;
  const entries = raw.split(";").filter(Boolean);
  if (!entries.length) return null;
  return entries.map((e) => {
    const eStr = String(e);
    const eq = eStr.indexOf("=");
    if (eq === -1) return eStr;
    const k = eStr.slice(0, eq);
    const v = eStr.slice(eq + 1);
    if (!k || !v) return eStr;
    const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    return `${label}: ${v}`;
  }).join(" · ");
}

/* ── Inner Page ────────────────────────────────────────────────────── */
function ChallengeProofInner() {
  const params = useParams();
  const router = useRouter();
  const challengeId = String(params.challengeId ?? "");
  const { address } = useAccount();

  const [meta, setMeta] = useState<ChallengeMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [submissionState, setSubmissionState] = useState<SubmissionState | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fitness provider picker ──
  const FITNESS_CATS = new Set(["fitness","walking","running","cycling","hiking","swimming","strength","yoga","hiit","crossfit","rowing","calories","exercise"]);
  const isFitness = FITNESS_CATS.has((meta?.category ?? "").toLowerCase());
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);

  // Auto-select default provider from localStorage once meta loads
  useEffect(() => {
    if (!isFitness) return;
    const saved = getDefaultFitnessProvider();
    if (saved && FITNESS_PROVIDERS.some((p) => p.id === saved)) {
      setSelectedProvider(saved);
    }
  }, [isFitness]);

  const activeProvider: FitnessProvider | null = isFitness
    ? FITNESS_PROVIDERS.find((p) => p.id === selectedProvider) ?? null
    : null;

  const handleSelectProvider = (id: string) => {
    setSelectedProvider(id);
    setDefaultFitnessProvider(id);
    setProviderPickerOpen(false);
    setFile(null); // clear file when changing provider
  };

  useEffect(() => {
    if (!challengeId) return;
    setMetaLoading(true);
    setMetaError(null);
    fetch(`/api/challenges/meta/${challengeId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) { setMetaError(data.error); return; }
        setMeta(data as ChallengeMeta);
      })
      .catch((e) => setMetaError(e?.message || "Failed to load challenge"))
      .finally(() => setMetaLoading(false));
  }, [challengeId]);

  const capability = useProofCapability(
    meta ? { modelHash: meta.modelHash, modelId: meta.modelId, category: meta.category, game: meta.game } : null
  );

  const challengeParams: Record<string, unknown> = (() => {
    if (!meta?.params) return {};
    if (typeof meta.params === "object" && !Array.isArray(meta.params)) return meta.params;
    try { return JSON.parse(meta.params); } catch { return {}; }
  })();

  const modelHash = meta?.modelHash && is0x(meta.modelHash) ? meta.modelHash : null;
  const ruleHint = parseRuleHint(meta?.params);
  const modelName = formatModelName(meta?.modelId);

  const submitEvidence = useCallback(async () => {
    if (!modelHash || !address) return;
    setSubmissionState({ kind: "uploading" });
    try {
      const fd = new FormData();
      fd.set("modelHash", modelHash);
      fd.set("challengeId", challengeId);
      fd.set("subject", address);
      if (Object.keys(challengeParams).length) fd.set("params", JSON.stringify(challengeParams));
      if (file) fd.set("file", file);
      // Pass provider override for fitness challenges so the correct adapter is used
      if (activeProvider) fd.set("provider", activeProvider.adapterPrefix);
      const res = await fetch("/api/aivm/intake", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setSubmissionState({ kind: "error", message: json?.error || `Submission failed (${res.status})`, retryable: true });
        return;
      }
      setSubmissionState({ kind: "success", evidenceId: json.evidenceId, preview: json.preview });
    } catch (e: any) {
      setSubmissionState({ kind: "error", message: e?.message || "Network error", retryable: true });
    }
  }, [modelHash, address, challengeId, challengeParams, file, activeProvider]);

  const handleRetry = useCallback(() => { setSubmissionState(null); setFile(null); }, []);

  if (metaLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-(--text-muted) animate-pulse">Loading challenge…</div>;
  }
  if (metaError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
        <div className="panel p-8 text-center">
          <div className="text-lg font-semibold mb-2">Challenge not found</div>
          <p className="text-sm text-(--text-muted)">{metaError}</p>
          <Link href="/proofs" className="btn btn-primary mt-4 inline-block">Back to Submit Proof</Link>
        </div>
      </div>
    );
  }
  if (submissionState) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <button onClick={handleRetry} className="flex items-center gap-2 text-sm text-(--text-muted) hover:text-(--text) transition-colors">
          <ArrowLeft className="size-4" /> Back to submission
        </button>
        <SubmissionResult challengeId={challengeId} challengeTitle={meta?.title} state={submissionState} onRetry={handleRetry} />
      </div>
    );
  }

  const isUnsupported = !isFitness && (capability.mode === "unsupported" || capability.mode === "unknown");
  const canUploadFile = isFitness
    ? !!activeProvider
    : capability.mode === "file_upload" ||
      capability.mode === "mobile_upload" ||
      ((capability.mode === "account_required" || capability.mode === "linked_submit") && capability.accountConnected);

  // Resolved file accept and hints based on provider or VCE capability
  const resolvedFileAccept = isFitness && activeProvider
    ? activeProvider.fileAccept.join(",")
    : capability.mode === "account_required" || capability.mode === "linked_submit"
      ? ".json"
      : capability.fileAccept.join(",");
  const resolvedFileHint = isFitness && activeProvider
    ? activeProvider.fileHint
    : capability.fileHint;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {showQr && (
        <QrHandoff
          challengeId={challengeId}
          challengeTitle={meta?.title}
          subject={address ?? ""}
          sourceType={capability.type}
          sourceName={capability.name}
          sourceIcon={capability.icon}
          onClose={() => setShowQr(false)}
        />
      )}

      <button onClick={() => router.push("/proofs")} className="flex items-center gap-2 text-sm text-(--text-muted) hover:text-(--text) transition-colors">
        <ArrowLeft className="size-4" /> All challenges
      </button>

      {/* Challenge summary panel */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="size-5 text-(--accent) shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">Submit proof</span>
              </div>
              <h1 className="text-xl font-bold leading-tight">{meta?.title || `Challenge #${challengeId}`}</h1>
              {meta?.description && <p className="mt-2 text-sm text-(--text-muted) leading-relaxed max-w-lg">{meta.description}</p>}
            </div>
            <span className="chip chip--soft text-xs shrink-0">#{challengeId}</span>
          </div>
          {ruleHint && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Trophy className="size-4 text-(--accent) shrink-0" />
              <span className="font-medium">Goal:</span>
              <span className="text-(--text-muted)">{ruleHint}</span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {isFitness ? (
              <span className="vce-source-badge vce-source-badge--lg">
                <span>🏃</span>
                <span>Fitness Challenge</span>
              </span>
            ) : (
              <span className="vce-source-badge vce-source-badge--lg">
                <span>{capability.icon}</span>
                <span>{capability.name}</span>
              </span>
            )}
            {meta?.category && <span className="chip chip--soft text-xs capitalize">{meta.category}</span>}
          </div>
        </div>
      </motion.div>

      {/* Verification method panel */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="panel overflow-hidden">
        <div className="p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-4">
            {isFitness ? "Choose your tracking app" : "Verification method"}
          </div>

          {/* ── Fitness provider picker ── */}
          {isFitness && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FITNESS_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`select-card text-left transition-all ${selectedProvider === p.id ? "" : ""}`}
                    data-selected={selectedProvider === p.id ? "" : undefined}
                    onClick={() => handleSelectProvider(p.id)}
                  >
                    <div className="flex items-center gap-2 p-3">
                      <span className="text-xl">{p.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-tight">{p.name}</div>
                        <div className="text-xs text-(--text-muted) mt-0.5 truncate">{p.fileHint}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {activeProvider && (
                <div className="vce-state-block vce-state-block--info">
                  <span className="text-2xl shrink-0">{activeProvider.icon}</span>
                  <div>
                    <div className="font-semibold">Upload your {activeProvider.name} export</div>
                    <p className="text-sm mt-1 text-(--text-muted)">{activeProvider.instructions}</p>
                  </div>
                </div>
              )}

              {!selectedProvider && (
                <p className="text-sm text-(--text-muted)">
                  Select the app you used to track your activity. Your choice will be remembered for future submissions.
                </p>
              )}
            </div>
          )}

          {/* ── Non-fitness: original VCE flow ── */}
          {!isFitness && isUnsupported && (
            <div className="vce-state-block vce-state-block--warn">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Integration not available</div>
                <p className="text-sm mt-1 text-(--text-muted)">
                  {capability.type !== "unknown"
                    ? `This ${capability.name} model variant does not have a supported adapter yet.`
                    : "The data source for this challenge is not recognized."}
                </p>
                <Link href="/proofs/advanced" className="btn btn-ghost btn-sm mt-3 inline-flex">Advanced tool →</Link>
              </div>
            </div>
          )}

          {!isFitness && capability.mode === "mobile_upload" && (
            <div className="space-y-4">
              <div className="vce-state-block vce-state-block--info">
                <span className="text-2xl shrink-0">{capability.icon}</span>
                <div>
                  <div className="font-semibold">Export from your iPhone</div>
                  <p className="text-sm mt-1 text-(--text-muted)">{capability.instructions}</p>
                </div>
              </div>
            </div>
          )}

          {!isFitness && capability.mode === "file_upload" && (
            <div className="space-y-3">
              <div className="vce-state-block vce-state-block--info">
                <span className="text-2xl shrink-0">{capability.icon}</span>
                <div>
                  <div className="font-semibold">Upload your {capability.name} export</div>
                  <p className="text-sm mt-1 text-(--text-muted)">{capability.instructions}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {capability.fileAccept.map((ext) => (
                  <span key={ext} className="chip chip--soft text-xs">{ext.toUpperCase().replace(".", "")}</span>
                ))}
              </div>
            </div>
          )}

          {!isFitness && (capability.mode === "account_required" || capability.mode === "linked_submit") && (
            <div className="space-y-4">
              {capability.accountLoading ? (
                <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                  <Loader2 className="size-4 animate-spin" /> Checking account link…
                </div>
              ) : capability.accountConnected ? (
                <div className="vce-state-block vce-state-block--ok">
                  <CheckCircle className="size-5 shrink-0" />
                  <div>
                    <div className="font-semibold">
                      {capability.accountPlatform === "steam" ? "Steam" : "Riot"} connected
                      {capability.accountHandle && ` — ${capability.accountHandle}`}
                    </div>
                    <p className="text-sm mt-1 text-(--text-muted)">{capability.instructions}</p>
                  </div>
                </div>
              ) : (
                <div className="vce-state-block vce-state-block--warn">
                  <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">
                      {capability.accountPlatform === "steam" ? "Steam account required" : "Riot account required"}
                    </div>
                    <p className="text-sm mt-1 text-(--text-muted)">
                      {capability.accountPlatform === "steam"
                        ? "Link your Steam account to verify your Dota 2 match history through OpenDota."
                        : "Link your Riot account to verify your League of Legends match history."}
                    </p>
                    <Link
                      href={`/settings/linked-accounts?return=${encodeURIComponent(`/proofs/${challengeId}`)}`}
                      className="btn btn-primary btn-sm mt-3 inline-flex items-center gap-2"
                    >
                      <ExternalLink className="size-3.5" />
                      Connect {capability.accountPlatform === "steam" ? "Steam" : "Riot"}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Action panel */}
      {!isUnsupported && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="panel overflow-hidden">
          <div className="p-6 space-y-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">Submit evidence</div>

            {!address && (
              <div className="vce-state-block vce-state-block--warn">
                <AlertTriangle className="size-5 shrink-0" />
                <div className="text-sm">Connect your wallet to submit evidence.</div>
              </div>
            )}

            {address && canUploadFile && (
              <div
                className="vce-upload-area"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={resolvedFileAccept}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <FileUp className="size-8 mx-auto text-(--text-muted) mb-3" />
                {file ? (
                  <div className="text-sm font-semibold text-(--accent)">{file.name}</div>
                ) : (
                  <>
                    <div className="text-sm font-semibold">
                      {isFitness && activeProvider
                        ? `Drop ${activeProvider.fileHint} here`
                        : capability.mode === "account_required" || capability.mode === "linked_submit"
                          ? "Drop match data JSON here"
                          : `Drop ${resolvedFileHint || "your file"} here`}
                    </div>
                    <div className="text-xs text-(--text-muted) mt-1">
                      or click to browse · {resolvedFileAccept.replace(/,/g, ", ")}
                    </div>
                  </>
                )}
              </div>
            )}

            {address && (
              <div className="flex flex-wrap gap-3">
                {/* Fitness: QR for Apple Health when selected */}
                {isFitness && activeProvider?.mobilePreferred && (
                  <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowQr(true)}>
                    <Smartphone className="size-4" /> Continue on mobile
                  </button>
                )}
                {/* Non-fitness: QR for Apple Health (primary) */}
                {!isFitness && capability.mode === "mobile_upload" && (
                  <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowQr(true)}>
                    <Smartphone className="size-4" /> Continue on mobile
                  </button>
                )}
                {/* Submit with file */}
                {canUploadFile && file && modelHash && (
                  <button className="btn btn-primary flex items-center gap-2" onClick={submitEvidence}>
                    <Upload className="size-4" /> Submit evidence
                  </button>
                )}
                {/* Upload prompt (no file selected) */}
                {canUploadFile && !file && !(isFitness && activeProvider?.mobilePreferred) && !((!isFitness) && capability.mode === "mobile_upload") && (
                  <button className="btn btn-primary flex items-center gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="size-4" /> Upload {activeProvider?.name ?? capability.name} data
                  </button>
                )}
                {/* Secondary: mobile option for non-Apple fitness or file-based */}
                {((isFitness && activeProvider && !activeProvider.mobilePreferred) || (!isFitness && capability.mode === "file_upload")) && (
                  <button className="btn btn-ghost flex items-center gap-2" onClick={() => setShowQr(true)}>
                    <Smartphone className="size-4" /> Continue on mobile
                  </button>
                )}
              </div>
            )}

            {address && !modelHash && (
              <div className="text-xs text-(--text-muted)">
                No model hash for this challenge.{" "}
                <Link href="/proofs/advanced" className="underline">Use the advanced tool.</Link>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <div className="text-center pt-2">
        <Link href="/proofs/advanced" className="text-xs text-(--text-muted) hover:text-(--text) transition-colors underline underline-offset-2">
          Advanced submission — manual model selection
        </Link>
      </div>
    </div>
  );
}

export default function ChallengeProofPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-12 text-center text-(--text-muted)">Loading…</div>}>
      <ChallengeProofInner />
    </Suspense>
  );
}
