"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Upload, FileUp, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import { useAccount } from "wagmi";
import { detectSource, type SourceType } from "@/lib/verificationCapability";

/* ── Types ──────────────────────────────────────────────────────────────── */
type SubmitState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; evidenceId?: string }
  | { kind: "error"; message: string };

/* ── Source-specific instructions ────────────────────────────────────────── */
const SOURCE_STEPS: Record<SourceType, { steps: string[]; tip?: string }> = {
  apple_health: {
    steps: [
      "Open the Health app on your iPhone.",
      "Tap your profile photo in the top-right corner.",
      'Scroll down and tap "Export All Health Data".',
      "Share or save the ZIP file, then upload it below.",
    ],
    tip: 'The export creates a ZIP file. Upload the entire ZIP — do not unzip it.',
  },
  strava: {
    steps: [
      "Open strava.com in a browser (or the Strava app).",
      'Go to Settings → My Account → "Download or Delete Your Account".',
      'Click "Request Your Archive" — Strava will email you a download link.',
      "Download activities.json or activities.csv and upload it below.",
    ],
  },
  garmin: {
    steps: [
      "Open Garmin Connect (connect.garmin.com).",
      'Go to your profile → "Export Your Data".',
      "Download the daily summary JSON or an individual activity TCX/GPX file.",
      "Upload the file that covers the challenge period below.",
    ],
    tip: "Garmin requires manual file upload — automatic collection is not available. Accepted formats: .json (daily steps), .tcx, .gpx (activities).",
  },
  fitbit: {
    steps: [
      "Open fitbit.com and log in.",
      'Go to Settings → Data Export → "Export My Fitbit Data".',
      "Download the ZIP and find the steps or activity JSON inside.",
      "Upload the JSON file below.",
    ],
  },
  google_fit: {
    steps: [
      "Open Google Takeout (takeout.google.com).",
      "Deselect all, then select Google Fit only.",
      "Download the archive and find the activity_log or derived_data JSON.",
      "Upload the JSON file below.",
    ],
  },
  dota: {
    steps: [
      "Make sure your Steam account is linked on LightChallenge.",
      "Find the qualifying match on Dotabuff or OpenDota.",
      "Export or copy the match JSON data.",
      "Upload the match data JSON below.",
    ],
    tip: "Your Steam account must be linked at Settings → Linked Accounts before evidence can be verified.",
  },
  lol: {
    steps: [
      "Make sure your Riot account is linked on LightChallenge.",
      "Export your match history JSON (via Riot API or a third-party tool).",
      "Ensure the JSON includes your PUUID and a matches array.",
      "Upload the JSON below.",
    ],
    tip: "Your Riot account must be linked at Settings → Linked Accounts.",
  },
  cs2: {
    steps: [
      "Make sure your Steam account is linked on LightChallenge.",
      "CS2 verification uses FACEIT — your Steam must be linked to a FACEIT account.",
      "Match data is fetched automatically from FACEIT once your Steam is linked.",
      "If needed, upload FACEIT match data JSON below.",
    ],
    tip: "Only FACEIT matches are verified. Valve does not provide a public API for CS2 matchmaking data.",
  },
  unknown: {
    steps: [
      "This challenge type could not be determined automatically.",
      "Use the advanced submission tool at /proofs/advanced.",
    ],
  },
};

/* ── Inner page ─────────────────────────────────────────────────────────── */
function MobileEvidenceInner() {
  const searchParams = useSearchParams();
  const challengeId = searchParams.get("challengeId") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const sourceTypeParam = (searchParams.get("sourceType") ?? "unknown") as SourceType;
  const { address: connectedAddress } = useAccount();

  // Subject must match connected wallet address
  const subjectMismatch =
    !!subject &&
    !!connectedAddress &&
    subject.toLowerCase() !== connectedAddress.toLowerCase();

  const returnHref = challengeId ? `/proofs/${challengeId}` : `/proofs`;

  // Derive source info from VCE
  const source = detectSource({ modelId: sourceTypeParam });

  // Load challenge title from meta API if challengeId is present
  const [challengeTitle, setChallengeTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!challengeId) return;
    fetch(`/api/challenges/meta/${challengeId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.title) setChallengeTitle(d.title); })
      .catch(() => {});
  }, [challengeId]);

  // File upload for relevant sources
  const [file, setFile] = useState<File | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch challenge model hash for submission
  const [modelHash, setModelHash] = useState<string | null>(null);
  useEffect(() => {
    if (!challengeId) return;
    fetch(`/api/challenges/meta/${challengeId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.modelHash) setModelHash(d.modelHash); })
      .catch(() => {});
  }, [challengeId]);

  const canSubmitFile = source.mode === "mobile_upload" || source.mode === "file_upload";

  async function handleSubmit() {
    if (!file || !modelHash || !subject || !challengeId) return;
    if (subjectMismatch) {
      setSubmitState({ kind: "error", message: "Connected wallet does not match the subject address. Switch wallets or use the correct account." });
      return;
    }
    setSubmitState({ kind: "uploading" });
    try {
      const fd = new FormData();
      fd.set("modelHash", modelHash);
      fd.set("challengeId", challengeId);
      fd.set("subject", subject);
      fd.set("file", file);
      const res = await fetch("/api/aivm/intake", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setSubmitState({ kind: "error", message: json?.error || "Submission failed" });
        return;
      }
      setSubmitState({ kind: "success", evidenceId: json.evidenceId });
    } catch (e: any) {
      setSubmitState({ kind: "error", message: e?.message || "Network error" });
    }
  }

  const steps = SOURCE_STEPS[source.type] ?? SOURCE_STEPS.unknown;

  return (
    <div
      className="min-h-screen"
      style={{ padding: "env(safe-area-inset-top, 16px) 0 env(safe-area-inset-bottom, 24px)" }}
    >
      <div className="max-w-sm mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div>
          {challengeId && (
            <Link href={returnHref} className="flex items-center gap-1.5 text-sm text-(--text-muted) mb-4">
              <ArrowLeft className="size-4" /> Back to challenge
            </Link>
          )}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{source.icon}</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">
                {source.name} Evidence
              </h1>
              {challengeTitle && (
                <p className="text-xs text-(--text-muted) mt-0.5">{challengeTitle}</p>
              )}
            </div>
          </div>
          {challengeId && (
            <span className="chip chip--soft text-xs">Challenge #{challengeId}</span>
          )}
        </div>

        {/* Instructions */}
        {submitState.kind === "idle" && (
          <div className="panel p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
              How to export your data
            </div>
            <ol className="space-y-2">
              {steps.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5"
                    style={{
                      background: "color-mix(in oklab, var(--accent) 20%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-(--text-muted) leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            {steps.tip && (
              <div className="flex items-start gap-2 text-xs text-(--warn) mt-2">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>{steps.tip}</span>
              </div>
            )}
          </div>
        )}

        {/* Subject mismatch warning */}
        {subjectMismatch && submitState.kind === "idle" && (
          <div className="panel p-4 flex items-start gap-2 border border-amber-500/30">
            <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-(--text-muted)">
              <span className="font-semibold text-amber-500">Wallet mismatch.</span>{" "}
              The subject address does not match your connected wallet. Switch to the correct wallet before submitting.
            </div>
          </div>
        )}

        {/* File upload */}
        {submitState.kind === "idle" && canSubmitFile && modelHash && subject && !subjectMismatch && (
          <div className="space-y-3">
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
                accept={source.fileAccept.join(",")}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <FileUp className="size-7 mx-auto text-(--text-muted) mb-2" />
              {file ? (
                <div className="text-sm font-semibold text-(--accent)">{file.name}</div>
              ) : (
                <>
                  <div className="text-sm font-semibold">Tap to select file</div>
                  <div className="text-xs text-(--text-muted) mt-0.5">{source.fileAccept.join(", ")}</div>
                </>
              )}
            </div>

            {file && (
              <button className="btn btn-primary w-full flex items-center justify-center gap-2" onClick={handleSubmit}>
                <Upload className="size-4" /> Submit evidence
              </button>
            )}
          </div>
        )}

        {/* Uploading */}
        {submitState.kind === "uploading" && (
          <div className="panel p-6 text-center space-y-3">
            <div className="animate-spin text-3xl">⚙️</div>
            <div className="font-semibold">Submitting evidence…</div>
            <p className="text-xs text-(--text-muted)">This usually takes a few seconds.</p>
          </div>
        )}

        {/* Success */}
        {submitState.kind === "success" && (
          <div className="panel p-6 text-center space-y-4">
            <CheckCircle className="size-10 mx-auto text-(--ok)" />
            <div>
              <div className="font-bold text-lg">Evidence submitted!</div>
              <p className="text-sm text-(--text-muted) mt-1">
                Your data for challenge #{challengeId} has been recorded. The AI pipeline will evaluate
                it shortly.
              </p>
            </div>
            <Link href={returnHref} className="btn btn-primary inline-flex items-center gap-2">
              Track progress →
            </Link>
          </div>
        )}

        {/* Error */}
        {submitState.kind === "error" && (
          <div className="panel p-5 space-y-3">
            <div className="flex items-center gap-2 text-(--danger)">
              <AlertTriangle className="size-5" />
              <span className="font-semibold">Submission failed</span>
            </div>
            <p className="text-sm text-(--text-muted)">{submitState.message}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => setSubmitState({ kind: "idle" })}>
              Try again
            </button>
          </div>
        )}

        {/* Unsupported / no upload path on mobile */}
        {!canSubmitFile && submitState.kind === "idle" && (
          <div className="panel p-4 text-center space-y-3">
            <p className="text-sm text-(--text-muted)">
              This challenge type requires additional setup on desktop (account linking).
            </p>
            <Link href={returnHref} className="btn btn-primary btn-sm inline-flex">
              Go to desktop proof page →
            </Link>
          </div>
        )}

        {/* Return link */}
        {challengeId && submitState.kind === "idle" && (
          <div className="text-center pt-2">
            <Link href={returnHref} className="text-xs text-(--text-muted) underline underline-offset-2">
              Return to challenge proof page
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-(--text-muted) pt-2">LightChallenge · Secure evidence</p>
      </div>
    </div>
  );
}

export default function MobileEvidencePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-(--text-muted)">Loading…</div>
    }>
      <MobileEvidenceInner />
    </Suspense>
  );
}
