// app/proofs/components/Step3_Execute.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, File, CheckCircle, ArrowRight } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { useToasts } from "@/lib/ui/toast";

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
  intakeResult: any | null;
  txHash?: string | null;
  error: string | null;
  onPreview: () => void;
  onSubmit?: () => void;
  canSubmit?: boolean;
  pending: boolean;
}

export default function Step3_Execute({
  file,
  onFileChange,
  intakeResult,
  error,
  onPreview,
  pending,
}: Props) {
  const [isDragging, setIsDragging] = React.useState(false);
  const { push } = useToasts();

  // ✔️ Show errors as glass toast (auto-dismiss), not as an inline banner
  React.useEffect(() => {
    if (error) push(error, 2600);
  }, [error, push]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold">Submit Proof</h2>
        <p className="mt-2 text-(--text-muted)">
          Upload your data and submit it for AI verification. The Lightchain network handles on-chain proof automatically.
        </p>
      </div>

      {/* Optional file intake */}
      <div className="panel">
        <div className="panel-header">Provide Data (optional)</div>
        <div className="panel-body">
          <div
            className={[
              "relative flex flex-col items-center justify-center p-10 rounded-xl text-center transition-all duration-300",
              "border-2 border-dashed",
              "border-(--border) hover:border-(--accent-1)/60",
            ].join(" ")}
            style={
              isDragging
                ? {
                    borderColor: "var(--accent-1)",
                    background:
                      "color-mix(in oklab, var(--accent-1) 12%, transparent)",
                  }
                : undefined
            }
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) onFileChange(e.dataTransfer.files[0]);
            }}
          >
            <UploadCloud
              size={48}
              className={`transition-transform ${
                isDragging ? "scale-110" : ""
              } text-(--text-muted) mb-4`}
              aria-hidden
            />
            <h4 className="font-semibold">Drag &amp; Drop a File</h4>
            <p className="text-(--text-muted)">or click to browse</p>

            {file && (
              <p className="mt-4 text-emerald-400 font-medium flex items-center gap-2">
                <File size={16} aria-hidden /> {file.name}
              </p>
            )}

            <input
              type="file"
              className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
              aria-label="Upload file"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {!intakeResult && (
          <button
            className="btn btn-primary px-4 py-2"
            onClick={onPreview}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? "Submitting…" : "Submit evidence"}
          </button>
        )}

        {intakeResult && (
          <button
            className="btn btn-ghost px-4 py-2 text-xs"
            onClick={onPreview}
            disabled={pending}
          >
            Re-submit
          </button>
        )}
      </div>

      {/* Results */}
      <AnimatePresence>
        {intakeResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel">
            <div className="panel-header">Results</div>
            <div className="panel-body space-y-4">
              {intakeResult && (
                <div aria-live="polite" role="status" className="space-y-3">
                  <p className="flex items-center gap-2 font-semibold text-emerald-300 mb-2">
                    <CheckCircle aria-hidden /> Evidence submitted successfully
                  </p>
                  <p className="text-sm text-(--text-muted)">
                    Your evidence has been recorded and will be evaluated by the AI verification pipeline.
                    Once verified, the Lightchain AIVM network handles on-chain proof automatically.
                  </p>
                  <Link
                    href="/me/challenges"
                    className="next-step-cta inline-flex items-center gap-1"
                  >
                    Track your progress <ArrowRight size={14} aria-hidden />
                  </Link>
                  <details className="rounded-lg">
                    <summary className="cursor-pointer text-xs text-(--text-muted)">Technical details</summary>
                    <pre className="p-4 rounded-lg text-xs whitespace-pre-wrap">
                      {JSON.stringify(intakeResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}