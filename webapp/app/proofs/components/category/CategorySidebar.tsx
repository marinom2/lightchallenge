"use client";

import * as React from "react";
import type { UiModel } from "../../types";

/* tiny cx helper */
const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

export type CategoryKey =
  | "favorites"
  | "all"
  | "gaming"
  | "fitness"
  | "social"
  | "custom";

export type FilterKey = "steam" | "aivm";

/* Heuristic (unchanged) */
export function autoCategoryFor(
  m: UiModel
): Exclude<CategoryKey, "favorites"> {
  const name = m.name.toLowerCase();
  if (name.includes("dota") || name.includes("league") || name.includes("match"))
    return "gaming";
  if (
    name.includes("apple") ||
    name.includes("garmin") ||
    name.includes("strava") ||
    name.includes("steps")
  )
    return "fitness";
  if (name.includes("friend") || name.includes("following")) return "social";
  return "custom";
}

/* Defaults – use full labels so they fit when we widen the sidebar */
const DEFAULT_CATS: Array<{ key: CategoryKey; label: string }> = [
  { key: "favorites", label: "Favorites" },
  { key: "all", label: "All models" },
  { key: "gaming", label: "Gaming & Esports" },
  { key: "fitness", label: "Health & Fitness" },
  { key: "social", label: "Social" },
  { key: "custom", label: "Other / Custom" },
];

const DEFAULT_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "steam", label: "Steam" },
  { key: "aivm", label: "AIVM" },
];

/* Storage keys */
const CAT_ORDER_KEY = "lc_cat_order_v2";
const FILTER_ORDER_KEY = "lc_filter_order_v2";

/* utils */
const reorder = <T,>(arr: T[], from: number, to: number) => {
  const copy = arr.slice();
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
};

type Props = {
  selected: CategoryKey;
  onSelect: (c: CategoryKey) => void;
  counts: Record<CategoryKey, number>;
  filters?: Array<{ key: FilterKey; label: string; active: boolean }>;
  onToggleFilter?: (key: FilterKey) => void;

  /** Render style: “card” keeps chrome, “bare” removes background/border/padding */
  variant?: "card" | "bare";
  className?: string;

  /** NEW: always show section labels (Browse / Filters) even in bare mode */
  showSectionLabels?: boolean;
  /** NEW: extra vertical gap (px) inserted between categories and filters */
  gapBetweenSections?: number;
};

export default function CategorySidebar({
  selected,
  onSelect,
  counts,
  filters = DEFAULT_FILTERS.map((f) => ({ ...f, active: false })),
  onToggleFilter,
  variant = "bare",
  className,
  showSectionLabels = true,              // <— default: show labels
  gapBetweenSections = 12,               // <— default: 12px space between sections
}: Props) {
  /* Load/persist category order */
  const [cats, setCats] = React.useState(DEFAULT_CATS);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CAT_ORDER_KEY);
      if (!raw) return;
      const order: CategoryKey[] = JSON.parse(raw);
      const map = new Map(DEFAULT_CATS.map((c) => [c.key, c]));
      const next: typeof DEFAULT_CATS = [];
      order.forEach((k) => {
        const it = map.get(k);
        if (it) {
          next.push(it);
          map.delete(k);
        }
      });
      map.forEach((v) => next.push(v));
      setCats(next);
    } catch {}
  }, []);
  const persistCats = (next: typeof cats) => {
    setCats(next);
    try {
      localStorage.setItem(CAT_ORDER_KEY, JSON.stringify(next.map((c) => c.key)));
    } catch {}
  };

  /* Load/persist filter order */
  const [filterOrder, setFilterOrder] = React.useState(DEFAULT_FILTERS);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_ORDER_KEY);
      if (!raw) return;
      const order: FilterKey[] = JSON.parse(raw);
      const map = new Map(DEFAULT_FILTERS.map((f) => [f.key, f]));
      const next: typeof DEFAULT_FILTERS = [];
      order.forEach((k) => {
        const it = map.get(k);
        if (it) {
          next.push(it);
          map.delete(k);
        }
      });
      map.forEach((v) => next.push(v));
      setFilterOrder(next);
    } catch {}
  }, []);
  const persistFilters = (next: typeof filterOrder) => {
    setFilterOrder(next);
    try {
      localStorage.setItem(
        FILTER_ORDER_KEY,
        JSON.stringify(next.map((f) => f.key))
      );
    } catch {}
  };

  /* DnD — container based (stable) */
  const catDragIdx = React.useRef<number | null>(null);
  const filterDragIdx = React.useRef<number | null>(null);

  const catGridRef = React.useRef<HTMLDivElement>(null);
  const filterGridRef = React.useRef<HTMLDivElement>(null);

  const onCatDragStart = (idx: number, e: React.DragEvent) => {
    catDragIdx.current = idx;
    e.dataTransfer.setData("text/plain", String(idx));
    e.dataTransfer.effectAllowed = "move";
  };
  const onCatDragEnterOrOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = (e.target as HTMLElement)?.closest<HTMLButtonElement>(
      "button[data-idx]"
    );
    if (catDragIdx.current == null || !target) return;
    const overIdx = Number(target.dataset.idx);
    if (!Number.isFinite(overIdx) || overIdx === catDragIdx.current) return;
    setCats((prev) => {
      const next = reorder(prev, catDragIdx.current!, overIdx);
      catDragIdx.current = overIdx;
      return next;
    });
  };
  const onCatDrop = () => {
    if (catDragIdx.current != null) persistCats(cats);
    catDragIdx.current = null;
  };

  const onFilterDragStart = (idx: number, e: React.DragEvent) => {
    filterDragIdx.current = idx;
    e.dataTransfer.setData("text/plain", String(idx));
    e.dataTransfer.effectAllowed = "move";
  };
  const onFilterDragEnterOrOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = (e.target as HTMLElement)?.closest<HTMLButtonElement>(
      "button[data-fidx]"
    );
    if (filterDragIdx.current == null || !target) return;
    const overIdx = Number(target.dataset.fidx);
    if (!Number.isFinite(overIdx) || overIdx === filterDragIdx.current) return;
    setFilterOrder((prev) => {
      const next = reorder(prev, filterDragIdx.current!, overIdx);
      filterDragIdx.current = overIdx;
      return next;
    });
  };
  const onFilterDrop = () => {
    if (filterDragIdx.current != null) persistFilters(filterOrder);
    filterDragIdx.current = null;
  };

  /* Pill class (uses your globals) */
  const pillBase =
    "pill-toggle w-full justify-between px-3 py-1.5 text-sm whitespace-nowrap cursor-grab active:cursor-grabbing";

  /* Wrapper classes */
  const wrap =
    variant === "bare"
      ? cx("category-zone category-zone--bare", className)
      : cx("category-zone rounded-2xl p-3", className);

  return (
    <nav className={wrap} aria-label="Categories">
      {/* Labels (now can show in bare too) */}
      {showSectionLabels && <div className="sidebar-title mb-2">Browse</div>}

      {/* CATEGORIES — 2 columns */}
      <div
        ref={catGridRef}
        className="pill-grid pill-grid--2"
        onDragEnter={onCatDragEnterOrOver}
        onDragOver={onCatDragEnterOrOver}
        onDrop={onCatDrop}
      >
        {cats.map(({ key, label }, idx) => {
          const active = selected === key;
          const cnt = counts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              title={label}
              data-idx={idx}
              draggable
              onDragStart={(e) => onCatDragStart(idx, e)}
              onClick={() => onSelect(key)}
              aria-current={active ? "page" : undefined}
              aria-pressed={active}
              className={cx(pillBase, active && "is-active")}
            >
              <span className="label truncate">{label}</span>
              <span className="count text-[11px] px-1.5 py-[2px] rounded-full">
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bigger gap between sections */}
      <div style={{ height: gapBetweenSections }} />

      {/* Filters header always visible when requested */}
      {showSectionLabels && <div className="sidebar-title mb-2">Filters</div>}

      {/* FILTERS — 3 columns */}
      <div
        ref={filterGridRef}
        className="pill-grid pill-grid--3"
        onDragEnter={onFilterDragEnterOrOver}
        onDragOver={onFilterDragEnterOrOver}
        onDrop={onFilterDrop}
      >
        {filterOrder.map(({ key, label }, idx) => {
          const active = !!filters.find((f) => f.key === key && f.active);
          return (
            <button
              key={key}
              type="button"
              title={label}
              data-fidx={idx}
              draggable
              onDragStart={(e) => onFilterDragStart(idx, e)}
              onClick={() => onToggleFilter?.(key)}
              aria-pressed={active}
              className={cx(pillBase, active && "is-active")}
            >
              <span className="label truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer hint only for “card” (keeps your previous behavior) */}
      {variant === "card" && (
        <>
          <div className="sidebar-divider" />
          <div className="text-[11px] opacity-70 leading-tight">
            ↑↓ to move · ↵ to pin · ⌘C to copy hash · Drag to reorder
          </div>
        </>
      )}
    </nav>
  );
}