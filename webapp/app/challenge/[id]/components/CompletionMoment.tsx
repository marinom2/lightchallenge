"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassIcon } from "@/app/components/ui/GlassIcon";
import * as Lucide from "lucide-react";

const PartyPopper = (Lucide as any).PartyPopper ?? Lucide.Award;

export default function CompletionMoment({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-100 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />

          <motion.div
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            className="panel p-6 text-center"
          >
            <div className="flex justify-center mb-3">
              <GlassIcon icon={PartyPopper} size={32} />
            </div>

            <div className="text-lg font-semibold">Challenge completed</div>
            <div className="text-sm text-(--text-muted) mt-1">
              Rewards are now available to claim
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}