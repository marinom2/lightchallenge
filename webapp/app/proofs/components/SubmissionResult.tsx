// app/proofs/components/SubmissionResult.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, RotateCcw, ArrowRight, AlertTriangle } from "lucide-react";

export type SubmissionState =
  | { kind: "uploading" }
  | { kind: "success"; evidenceId?: string; preview?: any[] }
  | { kind: "error"; message: string; retryable?: boolean }
  | { kind: "pending_verification" }
  | { kind: "verified"; pass: boolean; reasons?: string[] };

interface Props {
  challengeId: string;
  challengeTitle?: string;
  state: SubmissionState;
  onRetry?: () => void;
  onClose?: () => void;
}

export default function SubmissionResult({
  challengeId,
  challengeTitle,
  state,
  onRetry,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="proof-result-panel"
    >
      {/* Uploading */}
      {state.kind === "uploading" && (
        <div className="text-center py-8 space-y-4">
          <Loader2 className="size-10 mx-auto text-(--accent) animate-spin" />
          <div>
            <div className="text-lg font-semibold">Submitting evidence…</div>
            <p className="text-sm text-(--text-muted) mt-1">
              Your evidence is being processed. This usually takes a few seconds.
            </p>
          </div>
        </div>
      )}

      {/* Success */}
      {state.kind === "success" && (
        <div className="space-y-5">
          <div className="text-center">
            <div className="proof-result-icon proof-result-icon--success">
              <CheckCircle className="size-8" />
            </div>
            <h3 className="text-xl font-bold mt-4">Evidence submitted</h3>
            <p className="text-sm text-(--text-muted) mt-2 max-w-sm mx-auto">
              Your evidence for {challengeTitle ? `"${challengeTitle}"` : `Challenge #${challengeId}`} has
              been recorded successfully.
            </p>
          </div>

          {/* What happens next */}
          <div className="proof-next-steps">
            <div className="text-xs font-semibold uppercase tracking-widest text-(--text-muted) mb-3">
              What happens next
            </div>
            <ol className="space-y-3">
              <li className="proof-step-item proof-step-item--active">
                <span className="proof-step-number">1</span>
                <div>
                  <div className="text-sm font-semibold">AI Evaluation</div>
                  <div className="text-xs text-(--text-muted)">
                    Your evidence will be evaluated by the AI verification pipeline.
                  </div>
                </div>
              </li>
              <li className="proof-step-item">
                <span className="proof-step-number">2</span>
                <div>
                  <div className="text-sm font-semibold">AIVM Verification</div>
                  <div className="text-xs text-(--text-muted)">
                    Once evaluated, the Lightchain AIVM network verifies and attests the result on-chain.
                  </div>
                </div>
              </li>
              <li className="proof-step-item">
                <span className="proof-step-number">3</span>
                <div>
                  <div className="text-sm font-semibold">Claim Reward</div>
                  <div className="text-xs text-(--text-muted)">
                    If verification passes, your challenge finalizes and you can claim your reward.
                  </div>
                </div>
              </li>
            </ol>
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link
              href="/me/challenges"
              className="btn btn-primary flex items-center gap-2"
            >
              Track progress <ArrowRight className="size-4" />
            </Link>
            <Link
              href={`/challenge/${challengeId}`}
              className="btn btn-ghost"
            >
              View challenge
            </Link>
          </div>

          {/* Technical details */}
          {state.preview && state.preview.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-(--text-muted) hover:text-(--text) transition-colors">
                Technical details ({state.preview.length} records)
              </summary>
              <pre className="mt-2 p-3 rounded-lg text-[11px] bg-(--card) overflow-auto max-h-48">
                {JSON.stringify(state.preview.slice(0, 10), null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {state.kind === "error" && (
        <div className="space-y-5">
          <div className="text-center">
            <div className="proof-result-icon proof-result-icon--error">
              <XCircle className="size-8" />
            </div>
            <h3 className="text-xl font-bold mt-4">Submission failed</h3>
            <p className="text-sm text-(--text-muted) mt-2 max-w-sm mx-auto">
              {state.message}
            </p>
          </div>

          {/* Troubleshooting */}
          <div className="panel p-4 space-y-2">
            <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-widest">Common causes</div>
            <ul className="text-xs text-(--text-muted) space-y-1.5 list-disc list-inside">
              <li>File format not supported by this challenge type</li>
              <li>Data doesn&apos;t cover the required time range</li>
              <li>Wrong account or evidence source linked</li>
              <li>Network or server error — try again</li>
            </ul>
          </div>

          {state.retryable !== false && onRetry && (
            <div className="flex justify-center">
              <button onClick={onRetry} className="btn btn-primary flex items-center gap-2">
                <RotateCcw className="size-4" /> Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pending verification */}
      {state.kind === "pending_verification" && (
        <div className="text-center py-6 space-y-4">
          <Loader2 className="size-10 mx-auto text-(--accent) animate-spin" />
          <div>
            <div className="text-lg font-semibold">Verification in progress</div>
            <p className="text-sm text-(--text-muted) mt-1 max-w-sm mx-auto">
              The Lightchain AIVM network is verifying your evidence.
              This can take a few minutes.
            </p>
          </div>
          <Link href="/me/challenges" className="btn btn-ghost inline-flex items-center gap-2">
            Track progress <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      {/* Verified */}
      {state.kind === "verified" && (
        <div className="space-y-5">
          <div className="text-center">
            <div className={`proof-result-icon ${state.pass ? "proof-result-icon--success" : "proof-result-icon--error"}`}>
              {state.pass ? <CheckCircle className="size-8" /> : <XCircle className="size-8" />}
            </div>
            <h3 className="text-xl font-bold mt-4">
              {state.pass ? "Proof verified" : "Verification failed"}
            </h3>
            <p className="text-sm text-(--text-muted) mt-2 max-w-sm mx-auto">
              {state.pass
                ? "Your evidence passed verification. Your challenge can proceed to finalization and you can claim your reward."
                : "Your evidence did not meet the challenge requirements."}
            </p>
          </div>

          {!state.pass && state.reasons?.length ? (
            <div className="panel p-4">
              <div className="text-xs font-semibold text-(--text-muted) uppercase tracking-widest mb-2">Reasons</div>
              <ul className="text-sm space-y-1">
                {state.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-(--danger)">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 justify-center">
            {state.pass ? (
              <Link href="/claims" className="btn btn-primary">
                Check claim status →
              </Link>
            ) : (
              onRetry && (
                <button onClick={onRetry} className="btn btn-primary flex items-center gap-2">
                  <RotateCcw className="size-4" /> Submit new evidence
                </button>
              )
            )}
            <Link href={`/challenge/${challengeId}`} className="btn btn-ghost">
              View challenge
            </Link>
          </div>
        </div>
      )}
    </motion.div>
  );
}
