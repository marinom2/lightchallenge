"use client";

import * as React from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  FixedSizeGrid as Grid,
  type GridChildComponentProps,
  type FixedSizeGrid,
} from "react-window";
import { Cpu, Atom, PlugZap } from "lucide-react";
import type { UiModel } from "../types";

export type GridApi = {
  scrollToIndex: (index: number) => void;
  getCount: () => number;
  getColumnCount: () => number;
};

type Props = {
  items: UiModel[];
  onHover?: (m: UiModel | null) => void;
  onSelect?: (hash: `0x${string}`) => void;
  columnWidth?: number;
  rowHeight?: number;
  gap?: number;
  /** highlighted index for keyboard nav (controlled). If null, internal nav is used. */
  activeIndex?: number | null;
  /** receive an api for keyboard nav */
  onApi?: (api: GridApi | null) => void;
  /** enable built-in keyboard navigation (default: true) */
  enableKeyboard?: boolean;
  /** Optional accessible label for the grid region */
  ariaLabel?: string;
};

export default function VirtualizedGrid({
  items,
  onHover,
  onSelect,
  columnWidth = 320,
  rowHeight = 88,
  gap = 8,
  activeIndex = null,
  onApi,
  enableKeyboard = true,
  ariaLabel = "Models grid",
}: Props) {
  const gridRef = React.useRef<FixedSizeGrid>(null);
  const colCountRef = React.useRef<number>(1);

  // Internal selection when parent doesn't control the index
  const [internalIndex, setInternalIndex] = React.useState<number>(0);
  const isControlled = activeIndex !== null && activeIndex !== undefined;
  const curIndex = isControlled ? (activeIndex as number) : internalIndex;

  const Cell = React.useCallback(
    ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
      const index = rowIndex * colCountRef.current + columnIndex;
      const m = items[index];
      if (!m) return null;

      const requiresSteam = m.providers?.includes("steam");
      const isActive = curIndex === index;

      const cellStyle: React.CSSProperties = {
        ...style,
        left: (style as any).left + gap,
        top: (style as any).top + gap,
        width: (style as any).width - gap * 2,
        height: (style as any).height - gap * 2,
      };

      return (
        <div
          style={cellStyle}
          onMouseEnter={() => onHover?.(m)}
          onMouseLeave={() => onHover?.(null)}
          role="gridcell"
          aria-selected={isActive || undefined}
          data-index={index}
        >
          <button
            className="model-row w-full h-full relative overflow-hidden"
            type="button"
            aria-label={`Preview ${m.name}`}
            onClick={() => onSelect?.(m.modelHash)}
            style={
              isActive
                ? {
                    outline:
                      "2px solid color-mix(in oklab,var(--ring) 80%,transparent)",
                  }
                : undefined
            }
          >
            <div className="model-row__icon" aria-hidden>
              {m.verifierKind === "ZK" ? <Atom size={16} /> : <Cpu size={16} />}
            </div>

            <div className="min-w-0">
              <div className="model-row__title truncate">{m.name}</div>
              <div className="model-row__meta">
                <span className="chip chip--info">{m.verifierKind}</span>
                {requiresSteam && (
                  <span className="chip chip--info">
                    <PlugZap size={12} /> Steam link
                  </span>
                )}
              </div>
              <div className="model-row__hover mono">{short(m.modelHash)}</div>
            </div>
          </button>
        </div>
      );
    },
    [items, onHover, onSelect, gap, curIndex]
  );

  // Keyboard navigation (internal, enabled by default when uncontrolled)
  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!enableKeyboard) return;
    if (isControlled) return; // parent controls selection
    const el = containerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      const cols = colCountRef.current;
      let next = curIndex;
      const max = items.length - 1;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          next = Math.min(curIndex + 1, max);
          break;
        case "ArrowLeft":
          e.preventDefault();
          next = Math.max(curIndex - 1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          next = Math.min(curIndex + cols, max);
          break;
        case "ArrowUp":
          e.preventDefault();
          next = Math.max(curIndex - cols, 0);
          break;
        case "Home":
          e.preventDefault();
          next = 0;
          break;
        case "End":
          e.preventDefault();
          next = max;
          break;
        case "Enter":
          if (items[curIndex]) onSelect?.(items[curIndex].modelHash);
          return;
        default:
          return;
      }

      setInternalIndex(next);
      // scroll into view
      const r = Math.floor(next / cols);
      const c = next % cols;
      gridRef.current?.scrollToItem({
        rowIndex: r,
        columnIndex: c,
        align: "smart",
      });
    };

    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [enableKeyboard, isControlled, curIndex, items, onSelect]);

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label={ariaLabel}
      tabIndex={0}
      style={{ outline: "none" }}
    >
      <AutoSizer>
        {({ width, height }) => {
          const cols = Math.max(1, Math.floor(width / columnWidth));
          colCountRef.current = cols;
          const rows = Math.ceil(items.length / cols);

          // hand api to parent (keyboard nav)
          if (onApi) {
            onApi({
              scrollToIndex: (index: number) => {
                if (index < 0 || index >= items.length) return;
                const r = Math.floor(index / cols);
                const c = index % cols;
                gridRef.current?.scrollToItem({
                  rowIndex: r,
                  columnIndex: c,
                  align: "smart",
                });
              },
              getCount: () => items.length,
              getColumnCount: () => cols,
            });
          }

          return (
            <Grid
              ref={gridRef as any}
              columnCount={cols}
              rowCount={rows}
              columnWidth={columnWidth}
              rowHeight={rowHeight}
              width={width}
              height={height}
              overscanRowCount={3}
              overscanColumnCount={1}
            >
              {Cell}
            </Grid>
          );
        }}
      </AutoSizer>
    </div>
  );
}

function short(s: string) {
  return s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
}