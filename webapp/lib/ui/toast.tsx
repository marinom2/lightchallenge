// webapp/lib/ui/toast.tsx
"use client";

import * as React from "react";
import { create } from "zustand";
import { createPortal } from "react-dom";

// ✅ add 'kind'
type Toast = { id: number; text: string; kind?: "success" | "error" | "info"; timeout?: number };

type Store = {
  list: Toast[];
  last?: { text: string; at: number };
  // ✅ keep BC: (text, timeout?), add optional kind as 3rd arg
  push: (text: string, timeout?: number, kind?: Toast["kind"]) => void;
  pop: (id: number) => void;
  clear: () => void;
};

export const useToasts = create<Store>((set, get) => ({
  list: [],
  last: undefined,

  push: (text, timeout = 1800, kind) => {
    const now = Date.now();
    const last = get().last;

    // 1) Block rapid duplicates (same text within 400ms)
    if (last && last.text === text && now - last.at < 400) return;

    // 2) Replace existing toast with same text (refresh timer)
    const existing = get().list.find((t) => t.text === text);
    const id = existing?.id ?? now + Math.random();
    const next: Toast = { id, text, timeout, kind };

    const nextList = existing
      ? get().list.map((t) => (t.id === existing.id ? next : t))
      : [...get().list, next];

    set({ list: nextList, last: { text, at: now } });

    if (timeout > 0) {
      setTimeout(() => {
        get().pop(id); // remove only if not replaced again (id is preserved on replace)
      }, timeout);
    }
  },

  pop: (id) => set({ list: get().list.filter((t) => t.id !== id) }),
  clear: () => set({ list: [] }),
}));

export function Toasts() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { list, pop } = useToasts();

  if (!mounted) return null;

  return createPortal(
    <div className="toast-wrap" style={{ zIndex: 200 }} aria-live="polite" aria-atomic="true">
      {list.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind ? `toast--${t.kind}` : ""}`} // ✅ optional kind styling hook
          role="status"
          onClick={() => pop(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>,
    document.body
  );
}