"use client";

import * as React from "react";

export type UnderlineTab = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type Props = {
  tabs: UnderlineTab[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
  className?: string;
  indicatorInsetPx?: number; // must match .pilltabs padding-left (10px in CSS)
};

export function UnderlineTabs({
  tabs,
  activeKey,
  onChange,
  ariaLabel = "Tabs",
  className,
  indicatorInsetPx = 10,
}: Props) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  const recalc = React.useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const active = wrap.querySelector<HTMLElement>(
      `.pilltab[data-key="${CSS.escape(activeKey)}"]`
    );
    if (!active) return;

    const wrapRect = wrap.getBoundingClientRect();
    const a = active.getBoundingClientRect();

    // x relative to wrap; subtract inset because indicator's left is inset
    const ix = a.left - wrapRect.left - indicatorInsetPx;

    wrap.style.setProperty("--ix", `${Math.max(0, ix)}px`);
    wrap.style.setProperty("--iw", `${Math.max(24, a.width)}px`);
  }, [activeKey, indicatorInsetPx]);

  React.useLayoutEffect(() => {
    recalc();
  }, [recalc]);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onResize = () => recalc();
    window.addEventListener("resize", onResize);

    // Observe element size changes (wrapping, font swaps, container layout)
    const ro = new ResizeObserver(() => recalc());
    ro.observe(wrap);

    // Font load (best effort)
    const fonts = (document as any).fonts;
    if (fonts?.ready) fonts.ready.then(() => recalc()).catch(() => {});

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [recalc]);

  return (
    <div
      ref={wrapRef}
      className={`pilltabs ${className ?? ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((t) => {
        const isActive = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={!!t.disabled}
            disabled={t.disabled}
            className={`pilltab ${isActive ? "is-active" : ""}`}
            data-key={t.key}
            data-active={isActive ? "true" : "false"}
            onClick={() => !t.disabled && onChange(t.key)}
          >
            {t.icon ? <span className="tab-ic">{t.icon}</span> : null}
            <span className="tab-label">{t.label}</span>
          </button>
        );
      })}

      <span className="tab-indicator" aria-hidden="true" />
    </div>
  );
}

export default UnderlineTabs;