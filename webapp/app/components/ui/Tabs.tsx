"use client";

/**
 * Tabs — Horizontal tab navigation with animated indicator.
 *
 * Used for challenge detail (Overview/Participants/Evidence/Activity),
 * explore filters, achievements filter, etc.
 */

import React, { useRef, useEffect, useState, useCallback } from "react";

export type Tab = {
  id: string;
  label: string;
  /** Optional count badge. */
  count?: number;
  /** Disable this tab. */
  disabled?: boolean;
};

type TabsProps = {
  tabs: Tab[];
  activeId: string;
  onTabChange: (id: string) => void;
  /** Visual variant. */
  variant?: "underline" | "pills";
  size?: "sm" | "md";
  className?: string;
};

export default function Tabs({
  tabs,
  activeId,
  onTabChange,
  variant = "underline",
  size = "md",
  className = "",
}: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-tab-id="${activeId}"]`) as HTMLElement;
    if (!activeBtn) return;
    setIndicator({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
    });
  }, [activeId]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  const fontSize = size === "sm" ? "var(--lc-text-small)" : "var(--lc-text-body)";
  const gap = size === "sm" ? "var(--lc-space-1)" : "var(--lc-space-2)";

  if (variant === "pills") {
    return (
      <div
        ref={containerRef}
        role="tablist"
        className={`lc-tabs lc-tabs--pills ${className}`}
        style={{
          display: "flex",
          gap,
          flexWrap: "wrap",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            aria-selected={tab.id === activeId}
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: size === "sm" ? "4px 10px" : "6px 14px",
              borderRadius: "var(--lc-radius-pill)",
              fontSize,
              fontWeight: "var(--lc-weight-medium)" as any,
              color: tab.id === activeId ? "var(--lc-select-text)" : "var(--lc-text-secondary)",
              backgroundColor: tab.id === activeId ? "var(--lc-select)" : "transparent",
              border: tab.id === activeId ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
              boxShadow: tab.id === activeId ? "var(--lc-shadow-sm)" : "none",
              cursor: tab.disabled ? "not-allowed" : "pointer",
              opacity: tab.disabled ? 0.5 : 1,
              transition: `all var(--lc-dur-base) var(--lc-ease)`,
            }}
          >
            {tab.label}
            {tab.count != null && (
              <span
                style={{
                  fontSize: "var(--lc-text-caption)",
                  opacity: 0.7,
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // Underline variant
  return (
    <div
      ref={containerRef}
      role="tablist"
      className={`lc-tabs lc-tabs--underline ${className}`}
      style={{
        display: "flex",
        gap: "var(--lc-space-6)",
        position: "relative",
        borderBottom: "1px solid var(--lc-border)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          data-tab-id={tab.id}
          aria-selected={tab.id === activeId}
          disabled={tab.disabled}
          onClick={() => onTabChange(tab.id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: `${size === "sm" ? "8px" : "12px"} 0`,
            fontSize,
            fontWeight: tab.id === activeId ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
            color: tab.id === activeId ? "var(--lc-text)" : "var(--lc-text-secondary)",
            background: "none",
            border: "none",
            cursor: tab.disabled ? "not-allowed" : "pointer",
            opacity: tab.disabled ? 0.5 : 1,
            transition: `color var(--lc-dur-base) var(--lc-ease)`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {tab.label}
          {tab.count != null && (
            <span
              style={{
                fontSize: "var(--lc-text-caption)",
                color: "var(--lc-text-muted)",
                backgroundColor: "var(--lc-bg-overlay)",
                borderRadius: "var(--lc-radius-pill)",
                padding: "1px 6px",
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
      {/* Animated underline indicator */}
      <span
        style={{
          position: "absolute",
          bottom: -1,
          left: indicator.left,
          width: indicator.width,
          height: 2,
          backgroundColor: "var(--lc-select-text)",
          borderRadius: 1,
          transition: `left var(--lc-dur-base) var(--lc-ease), width var(--lc-dur-base) var(--lc-ease)`,
        }}
      />
    </div>
  );
}
