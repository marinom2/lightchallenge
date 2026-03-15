// app/proofs/components/Step1_SelectTask.tsx
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Search,
  Rows,
  LayoutGrid,
  ChevronDown,
  Cpu,
  Atom,
  Star,
  Trash2,
} from "lucide-react";
import CommandPalette from "./CommandPalette";
import RightDrawer from "./RightDrawer";
import CategorySidebar, {
  type CategoryKey,
  type FilterKey,
} from "./category/CategorySidebar"; 
import type { UiModel } from "../types";
import { useToasts } from "@/lib/ui/toast";

/* tiny cx */
const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

type Props = {
  models: UiModel[];
  onSelectModel: (hash: `0x${string}`) => void;
  searchQuery: string;
  onSearch: (query: string) => void;
};

type View = "list" | "grid";
type Scope = "ALL" | "AIVM" | "ZK";

const RECENTS_KEY = "lc_recent_models";
const MAX_RECENTS = 5;
const FAVS_KEY = "lc_favorite_models";

export default function Step1_SelectTask({
  models,
  onSelectModel,
  searchQuery,
  onSearch,
}: Props) {
  const { push } = useToasts();

  // filters / view
  const [scope, setScope] = React.useState<Scope>("ALL");
  const [steamOnly, setSteamOnly] = React.useState(false);
  const [sort, setSort] = React.useState<"AZ" | "ZA">("AZ");
  const [view, setView] = React.useState<View>("list");
  const [cmdOpen, setCmdOpen] = React.useState(false);

  // preview logic (hover vs pinned)
  const [hoverModel, setHoverModel] = React.useState<UiModel | null>(null);
  const [pinned, setPinned] = React.useState<UiModel | null>(null);

  // favorites (persisted)
  const [favorites, setFavorites] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    try {
      setFavorites(new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || "[]")));
    } catch {
      setFavorites(new Set());
    }
  }, []);
  const toggleFavorite = React.useCallback((hash: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(hash) ? next.delete(hash) : next.add(hash);
      try {
        localStorage.setItem(FAVS_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);

  // “recently used”
  const [recents, setRecents] = React.useState<UiModel[]>([]);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const hashes = JSON.parse(raw) as `0x${string}`[];
        setRecents(
          hashes
            .map((h) => models.find((m) => m.modelHash === h))
            .filter(Boolean) as UiModel[]
        );
      }
    } catch {}
  }, [models]);

  const pushRecent = React.useCallback(
    (m: UiModel) => {
      const nextHashes = [
        m.modelHash,
        ...recents
          .filter((r) => r.modelHash !== m.modelHash)
          .map((r) => r.modelHash),
      ].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(nextHashes));
      } catch {}
      setRecents(
        nextHashes
          .map((h) => models.find((mm) => mm.modelHash === h))
          .filter(Boolean) as UiModel[]
      );
    },
    [recents, models]
  );

  const clearRecents = React.useCallback(() => {
    try {
      localStorage.removeItem(RECENTS_KEY);
    } catch {}
    setRecents([]);
  }, []);

  // search / filter + sort
  const q = searchQuery.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    let list = models;
    if (scope !== "ALL") list = list.filter((m) => m.verifierKind === scope);
    if (steamOnly) list = list.filter((m) => m.providers?.includes("steam"));
    if (q)
      list = list.filter((m) => {
        const p = (m.providers || []).join(" ").toLowerCase();
        const notes = (m.notes || "").toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.modelHash.toLowerCase().includes(q) ||
          p.includes(q) ||
          notes.includes(q)
        );
      });

    const favs = favorites;
    list = [...list].sort((a, b) => {
      const favBias =
        Number(favs.has(b.modelHash)) - Number(favs.has(a.modelHash));
      if (favBias !== 0) return favBias;
      return sort === "AZ"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
    return list;
  }, [models, scope, steamOnly, q, sort, favorites]);

  // equal heights
  const shellRef = React.useRef<HTMLDivElement>(null);
  const [h, setH] = React.useState(560);
  React.useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const recompute = () => {
      const r = el.getBoundingClientRect();
      setH(Math.max(420, window.innerHeight - r.top - 24));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, []);

  /* Buckets for Center list */
  const tit = (s: string) => s.toLowerCase();
  const gaming = filtered.filter((m) => /dota|league|lol|steam/.test(tit(m.name)));
  const health = filtered.filter((m) => /apple|garmin|strava|fit/.test(tit(m.name)));
  const social = filtered.filter((m) => /twitter|farcaster|lens/.test(tit(m.name)));
  const favs = filtered.filter((m) => favorites.has(m.modelHash));

  const used = new Set([...gaming, ...health, ...social].map((x) => x.modelHash));
  const other = filtered.filter((m) => !used.has(m.modelHash));

  // Sidebar category state (CategorySidebar categories only)
  const [catKey, setCatKey] = React.useState<CategoryKey>("all");

  // Map CategoryKey -> center data
  const centerData = React.useMemo(() => {
    switch (catKey) {
      case "favorites":
        return favs;
      case "all":
        return filtered;
      case "gaming":
        return gaming;
      case "fitness":
        return health;
      case "social":
        return social;
      case "custom":
        return other;
    }
  }, [catKey, favs, filtered, gaming, health, social, other]);

  // Counts for CategorySidebar
  const catCounts: Record<CategoryKey, number> = {
    favorites: favs.length,
    all: filtered.length,
    gaming: gaming.length,
    fitness: health.length,
    social: social.length,
    custom: other.length,
  };

  // Filters for CategorySidebar
  const sidebarFilters: Array<{ key: FilterKey; label: string; active: boolean }> = [
    { key: "steam", label: "Steam", active: steamOnly },
    { key: "aivm", label: "AIVM", active: scope === "AIVM" },
  ];

  const onToggleSidebarFilter = (key: FilterKey) => {
    if (key === "steam") setSteamOnly((v) => !v);
    if (key === "aivm") setScope((s) => (s === "AIVM" ? "ALL" : "AIVM"));
  };

  // current preview model (pinned wins)
  const list = centerData;
  const preview = pinned ?? hoverModel ?? null;

  /* Star button (shared) */
  const StarButton = ({
    fav,
    onClick,
    className,
  }: {
    fav: boolean;
    onClick: (e: React.MouseEvent) => void;
    className?: string;
  }) => (
    <button
      type="button"
      className={cx("icon-btn star z-3", fav && "is-fav", className)}
      title={fav ? "Unfavorite" : "Favorite"}
      aria-pressed={fav}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Star size={14} />
    </button>
  );

  /* Row (list mode) */
  const Row = ({ m, idx }: { m: UiModel; idx: number }) => {
    const fav = favorites.has(m.modelHash);
    const isPinned = pinned?.modelHash === m.modelHash;

    return (
      <motion.button
        layout
        data-idx={idx}
        key={m.modelHash}
        className="model-row w-full relative overflow-hidden text-left"
        style={{ isolation: "isolate", padding: "14px 14px 16px 14px" }}
        onMouseEnter={() => setHoverModel(m)}
        onMouseLeave={() =>
          setHoverModel((cur) => (cur?.modelHash === m.modelHash ? null : cur))
        }
        onClick={() =>
          setPinned((cur) => (cur?.modelHash === m.modelHash ? null : m))
        }
        whileHover={{ scale: 1.005 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        data-active={isPinned ? "true" : undefined}
      >
        {isPinned && (
          <span
            aria-hidden
            className="lc-active-ring pointer-events-none absolute inset-0 z-0"
          />
        )}

        <StarButton
          fav={fav}
          className="absolute top-2 right-2"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(m.modelHash);
          }}
        />

        <div className="flex items-start gap-3 relative z-2">
          <div className="model-row__icon shrink-0">
            {m.verifierKind === "ZK" ? <Atom size={16} /> : <Cpu size={16} />}
          </div>

          <div className="min-w-0">
            <div
              className="text-[15px] font-semibold leading-snug text-white/95"
              style={{ whiteSpace: "normal", wordBreak: "break-word" }}
            >
              {m.name}
            </div>
          </div>
        </div>
      </motion.button>
    );
  };

  /* Card (grid mode) */
  const Card = ({ m, idx }: { m: UiModel; idx: number }) => {
    const fav = favorites.has(m.modelHash);
    const isPinned = pinned?.modelHash === m.modelHash;

    return (
      <motion.button
        layout
        data-idx={idx}
        key={m.modelHash}
        className="model-row model-card grid w-full relative overflow-hidden text-center"
        style={{ isolation: "isolate", minHeight: 152 }}
        onMouseEnter={() => setHoverModel(m)}
        onMouseLeave={() =>
          setHoverModel((cur) => (cur?.modelHash === m.modelHash ? null : cur))
        }
        onClick={() =>
          setPinned((cur) => (cur?.modelHash === m.modelHash ? null : m))
        }
        whileHover={{ scale: 1.006 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        data-active={isPinned ? "true" : undefined}
      >
        {isPinned && (
          <span
            aria-hidden
            className="lc-active-ring pointer-events-none absolute inset-0 z-0"
          />
        )}

        <StarButton
          fav={fav}
          className="absolute top-2 right-2"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(m.modelHash);
          }}
        />

        <div className="relative z-2 flex flex-col items-center justify-center w-full">
          <div className="model-card__title">{m.name}</div>
          <div className="model-type">{m.verifierKind}</div>
        </div>
      </motion.button>
    );
  };

  /* select -> remember (NO toast) */
  function selectAndContinue(hash: `0x${string}`) {
    const m = models.find((x) => x.modelHash === hash);
    if (m) pushRecent(m);
    onSelectModel(hash);
  }

  /* Global hotkeys: ⌘K to open palette; Enter pins; ⌘C copies + toast (only) */
  React.useEffect(() => {
    if (cmdOpen) return; // pause while palette open
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (!list?.length) return;

      if (e.key === "Enter" && (hoverModel || pinned)) {
        e.preventDefault();
        const base = pinned ?? hoverModel!;
        setPinned((cur) => (cur?.modelHash === base.modelHash ? null : base));
      }

      if (mod && e.key.toLowerCase() === "c" && (hoverModel || pinned)) {
        e.preventDefault();
        const base = pinned ?? hoverModel!;
        if (base?.modelHash) {
          navigator.clipboard.writeText(base.modelHash);
          push("Model hash copied ✓");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdOpen, list?.length, hoverModel, pinned, push]);

  return (
    <>
      <motion.div
        ref={shellRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-4 md:p-5"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 8%, transparent), color-mix(in oklab, #000 18%, var(--card)))",
          border:
            "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
        }}
      >
        <div
          className="
            grid grid-cols-1 gap-4 md:gap-5
            md:grid-cols-[230px_minmax(0,1fr)_minmax(360px,26vw)]
            lg:grid-cols-[234px_minmax(0,1fr)_minmax(380px,27vw)]
            xl:grid-cols-[236px_minmax(0,1fr)_minmax(400px,28vw)]
          "
        >
          {/* LEFT */}
          <aside
            className="rounded-2xl p-3 md:p-4"
            style={{
              height: h,
              overflow: "auto",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 6%, transparent), color-mix(in oklab, #000 18%, var(--card)))",
              border:
                "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
              boxShadow: "0 8px 32px rgba(0,0,0,.25)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-2">
              Browse
            </div>

            {/* Quick "Recent" chip remains separate */}
            <div className="flex items-center gap-2 mb-2">
              <button
                className="pill-toggle px-3 py-1.5 text-sm"
                title="Recently opened"
                onClick={() => setCatKey("all")} // optional: you can route this to a separate Recent view if you want
              >
                <span>Recent</span>
                <span className="count text-[11px] px-1.5 py-0.5 rounded-full">
                  {recents.length}
                </span>
              </button>
              {recents.length > 0 && (
                <button
                  type="button"
                  className="icon-btn"
                  title="Clear recent"
                  aria-label="Clear recent"
                  onClick={clearRecents}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Drag-reorderable category + filters */}
            <CategorySidebar
              variant="bare"
              showSectionLabels   
              gapBetweenSections={14} 
              selected={catKey}
              onSelect={setCatKey}
              counts={catCounts}
              filters={sidebarFilters}
              onToggleFilter={onToggleSidebarFilter}
            />

            {/* Search */}
            <div className="relative mt-3">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70"
              />
              <input
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Name, hash, provider…  (⌘K)"
                className="input pl-9! py-2! text-sm"
              />
            </div>

            {/* Quick Recent chips */}
            {recents.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-2">
                  Recent
                </div>
                <div className="flex flex-wrap gap-2">
                  {recents.slice(0, MAX_RECENTS).map((m) => (
                    <button
                      key={m.modelHash}
                      className="pill-toggle px-2.5 py-1 text-xs"
                      title={m.name}
                      onClick={() => setPinned(m)}
                    >
                      {m.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pill-toggle px-2.5 py-1 text-xs inline-flex items-center gap-1"
                    onClick={clearRecents}
                    title="Clear recent"
                  >
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 text-[11px] opacity-70">
              ↑↓ to move · ↵ to pin · ⌘C copy hash
            </div>
          </aside>

          {/* CENTER */}
          <section
            className="rounded-2xl"
            style={{
              height: h,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "color-mix(in oklab, var(--card) 92%, transparent)",
              border:
                "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
            }}
          >
            {/* header */}
            <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-2">
              <div className="text-sm opacity-70">{list.length} available</div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as "AZ" | "ZA")}
                    className="input py-1.5! pr-7! pl-2! text-xs"
                    aria-label="Sort"
                  >
                    <option value="AZ">A–Z</option>
                    <option value="ZA">Z–A</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 opacity-70"
                  />
                </div>

                <div className="segmented">
                  <button
                    className={cx(
                      "segmented__btn",
                      view === "list" && "is-active"
                    )}
                    onClick={() => setView("list")}
                    title="List"
                    aria-pressed={view === "list"}
                  >
                    <Rows size={15} />
                  </button>
                  <button
                    className={cx(
                      "segmented__btn",
                      view === "grid" && "is-active"
                    )}
                    onClick={() => setView("grid")}
                    title="Grid"
                    aria-pressed={view === "grid"}
                  >
                    <LayoutGrid size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* scroller */}
            <div className="flex-1 px-2 pb-2 overflow-auto">
              {list.length === 0 ? (
                <div className="empty">No models match your filters.</div>
              ) : view === "list" ? (
                <ul className="flex flex-col gap-2">
                  {list.map((m, i) => (
                    <li key={m.modelHash}>
                      <Row m={m} idx={i} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-[minmax(152px,auto)]">
                  {list.map((m, i) => (
                    <Card key={m.modelHash} m={m} idx={i} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT */}
          <aside className="relative z-5">
            <RightDrawer
              open={!!preview}
              model={preview}
              height={h}
              pinned={!!pinned}
              isFavorite={!!preview && favorites.has(preview!.modelHash)}
              onToggleFavorite={(hash) => toggleFavorite(hash)}
              onPin={() => preview && setPinned(preview)}
              onUnpin={() => setPinned(null)}
              onClose={() => {
                setHoverModel(null);
                setPinned(null);
              }}
              onPick={(hash) => {
                const m = models.find((x) => x.modelHash === hash);
                if (m) pushRecent(m);
                onSelectModel(hash as `0x${string}`);
              }}
              onCopyHash={(hash: `0x${string}`) => {
                navigator.clipboard.writeText(hash);
                push("Model hash copied ✓");
              }}
            />
          </aside>
        </div>
      </motion.div>

      {/* ⌘K quick picker */}
      <CommandPalette
        open={cmdOpen}
        models={filtered}
        favorites={favorites}
        onToggleFavorite={(hash) => toggleFavorite(hash)}
        onClose={() => setCmdOpen(false)}
        onSelect={(hash) => selectAndContinue(hash as `0x${string}`)}
        onCopyHash={(hash) => {
          navigator.clipboard.writeText(hash);
          push("Model hash copied ✓");
        }}
      />
    </>
  );
}