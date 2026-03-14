// app/proofs/components/ModelPreviewOverlay.tsx
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cpu, Atom, PlugZap, Copy, BadgeCheck, Star } from "lucide-react";
import type { UiModel } from "../types";

type Props = {
  model: UiModel | null;
  onClose: () => void;
  onSelectModel: (hash: `0x${string}`) => void;
  onToggleFavorite?: (hash: `0x${string}`) => void;
  isFavorite?: boolean;
  actionLabel?: string;
};

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

export default function ModelPreviewOverlay({
  model,
  onClose,
  onSelectModel,
  onToggleFavorite,
  isFavorite = false,
  actionLabel = "Select & Continue",
}: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!model) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [model]);

  React.useEffect(() => {
    if (!model) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [model, onClose]);

  if (!mounted || !model) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm md:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed md:hidden z-[121] inset-x-0 bottom-0 rounded-t-3xl p-5"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 8%, transparent), color-mix(in oklab, #000 26%, var(--card)))",
          borderTop:
            "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modelPreviewTitle"
        aria-describedby="modelPreviewDesc"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
      >
        <div className="flex items-start gap-3">
          <span className="grid place-items-center rounded-xl size-10 bg-white/10">
            {model.verifierKind === "ZK" ? <Atom size={16} /> : <Cpu size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 id="modelPreviewTitle" className="font-bold truncate">
                {model.name}
              </h3>
              <BadgeCheck size={16} className="opacity-60" />
            </div>
            <div
              id="modelPreviewDesc"
              className="mt-1 flex items-center gap-2 flex-wrap"
            >
              <span className="chip chip--info">{model.verifierKind}</span>
              {model.providers?.includes("steam") && (
                <span className="chip chip--info">
                  <PlugZap size={12} /> Steam link required
                </span>
              )}
            </div>
            <div className="mt-2 text-xs mono flex items-center gap-2 opacity-85">
              <span className="truncate">{model.modelHash}</span>
              <button
                className="copy-btn"
                onClick={() => navigator.clipboard.writeText(model.modelHash)}
              >
                <Copy size={12} />
              </button>
              <button
                className={cx("icon-btn star ml-1", isFavorite && "is-fav")}
                title={isFavorite ? "Unfavorite" : "Favorite"}
                aria-pressed={isFavorite}
                onClick={() => onToggleFavorite?.(model.modelHash)}
              >
                <Star size={14} />
              </button>
            </div>
            {model.notes && (
              <p className="mt-3 text-sm opacity-90">{model.notes}</p>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5">
          <button
            className="btn btn-primary w-full"
            onClick={() => onSelectModel(model.modelHash)}
          >
            {actionLabel}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}