// webapp/app/challenge/[id]/hooks/usePullToRefresh.ts
import * as React from "react";

export function usePullToRefresh(opts: {
  rootRef: React.RefObject<HTMLElement>;
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  haptics?: { light?: () => void; success?: () => void; error?: () => void };
  thresholdPx?: number;
  maxPullPx?: number;
}) {
  const { rootRef, enabled, onRefresh, refreshing, haptics, thresholdPx = 72, maxPullPx = 140 } = opts;
  const [pullPx, setPullPx] = React.useState(0);
  const [armed, setArmed] = React.useState(false);

  const startY = React.useRef<number | null>(null);
  const pulling = React.useRef(false);

  React.useEffect(() => {
    if (!enabled) return;

    const el = rootRef.current;
    if (!el) return;

    const atTop = () => {
      const winTop = typeof window !== "undefined" ? window.scrollY <= 0 : true;
      const elTop = (el as any).scrollTop != null ? (el as any).scrollTop <= 0 : true;
      return winTop && elTop;
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (!atTop()) return;
      startY.current = e.touches[0]?.clientY ?? null;
      pulling.current = false;
      setArmed(false);
      setPullPx(0);
    };

    const onMove = (e: TouchEvent) => {
      if (refreshing) return;
      if (startY.current == null) return;
      if (!atTop()) return;

      const y = e.touches[0]?.clientY ?? startY.current;
      const dy = y - startY.current;

      if (dy <= 0) {
        pulling.current = false;
        setPullPx(0);
        setArmed(false);
        return;
      }

      pulling.current = true;
      e.preventDefault();

      const eased = Math.min(maxPullPx, Math.pow(dy, 0.92));
      setPullPx(eased);

      const nextArmed = eased >= thresholdPx;
      setArmed(nextArmed);
    };

    const onEnd = async () => {
      if (refreshing) return;

      const shouldFire = pulling.current && pullPx >= thresholdPx;
      startY.current = null;
      pulling.current = false;

      if (shouldFire) {
        try {
          haptics?.light?.();
          await onRefresh();
          haptics?.success?.();
        } catch {
          haptics?.error?.();
        }
      }

      setPullPx(0);
      setArmed(false);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart as any);
      el.removeEventListener("touchmove", onMove as any);
      el.removeEventListener("touchend", onEnd as any);
      el.removeEventListener("touchcancel", onEnd as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rootRef, refreshing, thresholdPx, maxPullPx, haptics, pullPx, onRefresh]);

  return { pullPx, armed };
}
