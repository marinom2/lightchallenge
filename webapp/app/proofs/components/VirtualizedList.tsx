"use client";

import * as React from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  FixedSizeList as List,
  type ListChildComponentProps,
  type FixedSizeList,
} from "react-window";
import { Cpu, Atom, PlugZap } from "lucide-react";
import type { UiModel } from "../types";

export type ListApi = {
  scrollToIndex: (index: number) => void;
  getCount: () => number;
};

type Props = {
  items: UiModel[];
  onHover?: (m: UiModel | null) => void;
  onSelect?: (hash: `0x${string}`) => void;
  rowHeight?: number;
  /** highlighted row (for keyboard nav, controlled) */
  activeIndex?: number | null;
  /** receive an api for keyboard navigation */
  onApi?: (api: ListApi | null) => void;
  /** enable built-in keyboard navigation (default: true) */
  enableKeyboard?: boolean;
  /** Accessible label for the listbox */
  ariaLabel?: string;
};

export default function VirtualizedList({
  items,
  onHover,
  onSelect,
  rowHeight = 72,
  activeIndex = null,
  onApi,
  enableKeyboard = true,
  ariaLabel = "Models list",
}: Props) {
  const listRef = React.useRef<FixedSizeList>(null);

  // Internal selection when parent doesn't control the index
  const [internalIndex, setInternalIndex] = React.useState<number>(0);
  const isControlled = activeIndex !== null && activeIndex !== undefined;
  const curIndex = isControlled ? (activeIndex as number) : internalIndex;

  React.useEffect(() => {
    if (!onApi) return;
    onApi({
      scrollToIndex: (index: number) => {
        if (index < 0 || index >= items.length) return;
        listRef.current?.scrollToItem(index, "smart");
      },
      getCount: () => items.length,
    });
    return () => onApi(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const Row = React.useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const m = items[index];
      const requiresSteam = m.providers?.includes("steam");
      const isActive = curIndex === index;

      return (
        <div
          style={style}
          className="px-1"
          onMouseEnter={() => onHover?.(m)}
          onMouseLeave={() => onHover?.(null)}
          role="option"
          aria-selected={isActive || undefined}
          data-index={index}
        >
          <button
            className="model-row w-full relative overflow-hidden"
            type="button"
            aria-label={`Preview ${m.name}`}
            onClick={() => onSelect?.(m.modelHash)}
            style={
              isActive
                ? { outline: "2px solid color-mix(in oklab,var(--ring) 80%,transparent)" }
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
    [items, onHover, onSelect, curIndex]
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!enableKeyboard) return;
    if (isControlled) return; // parent controls selection
    const el = containerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      let next = curIndex;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          next = Math.min(curIndex + 1, items.length - 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          next = Math.max(curIndex - 1, 0);
          break;
        case "Home":
          e.preventDefault();
          next = 0;
          break;
        case "End":
          e.preventDefault();
          next = items.length - 1;
          break;
        case "Enter":
          if (items[curIndex]) onSelect?.(items[curIndex].modelHash);
          return;
        default:
          return;
      }

      setInternalIndex(next);
      listRef.current?.scrollToItem(next, "smart");
    };

    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [enableKeyboard, isControlled, curIndex, items, onSelect]);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      style={{ outline: "none" }}
    >
      <AutoSizer>
        {({ width, height }) => (
          <List
            ref={listRef as any}
            width={width}
            height={height}
            itemCount={items.length}
            itemSize={rowHeight}
            overscanCount={8}
          >
            {Row}
          </List>
        )}
      </AutoSizer>
    </div>
  );
}

function short(s: string) {
  return s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
}