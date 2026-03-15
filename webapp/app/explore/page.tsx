"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChainId } from "wagmi";
import type { Address } from "viem";
import { isAddress } from "viem";
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer";
import { useInterval } from "@/lib/ui/useInterval";
import type { ChallengeMeta } from "@/lib/types/challenge";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import EmptyState from "@/app/components/ui/EmptyState";
import Badge from "@/app/components/ui/Badge";

import ExploreHeader from "./components/ExploreHeader";
import ChallengeCard from "./components/ChallengeCard";
import { useFavorites } from "./components/useFavorites";
import SectionCarousel from "./components/SectionCarousel";
import useChainStatusCache, { type Status } from "./hooks/useChainStatusCache";

/* ──────────────────────────────────────────────────────────────────────────── */
type Category = "all" | "gaming" | "fitness" | "social" | "custom";

type ApiItemD1 = { id: string; creator?: Address; blockNumber: string; txHash: `0x${string}`; status: Status };
type ApiResponseD1 = { items: ApiItemD1[]; fromBlock: string; toBlock: string; error?: string };

type Row = {
  id: bigint;
  creator?: Address;
  blockNumber: bigint;
  txHash: `0x${string}`;
  status: Status;
  badges: Record<string, unknown>;
  category: Category;
  title?: string;
  description?: string;
  startTs?: bigint;
  game?: string | null;
  mode?: string | null;
  tags?: string[];
};

const DEFAULT_SPAN = 10_000n;

/* Helpers */
function normalizeGame(g?: string | null): string | null {
  if (!g) return null;
  const t = g.trim().toLowerCase();
  if (["cs", "cs2", "cs:go", "csgo", "counter-strike", "counter strike", "counter-strike 2"].includes(t)) return "CS2";
  if (t === "dota" || t === "dota2" || t === "dota 2") return "Dota 2";
  if (t === "lol" || t === "league" || t === "league of legends") return "League of Legends";
  if (t === "valorant") return "Valorant";
  if (["run","running"].includes(t)) return "Running";
  if (["walk","steps"].includes(t)) return "Steps";
  if (["hike","hiking"].includes(t)) return "Hiking";
  if (["cycle","cycling","bike"].includes(t)) return "Cycling";
  return g;
}

function matchesGame(selected: string, value?: string | null) {
  if (selected === "ALL") return true;
  const known = ["dota 2","cs2","league of legends","valorant"];
  const val = (normalizeGame(value) || "").toLowerCase();
  const sel = (normalizeGame(selected) || "").toLowerCase();
  if (selected === "Other") {
    return val && !known.includes(val);
  }
  return val === sel;
}

function mergeByIdNewer(first: Row[], second: Row[]) {
  const m = new Map<string, Row>();
  for (const r of first) m.set(r.id.toString(), r);
  for (const r of second) {
    const k = r.id.toString();
    const curr = m.get(k);
    if (!curr || r.blockNumber > curr.blockNumber) m.set(k, r);
  }
  return Array.from(m.values());
}

/* ── Onboarding preference survey ───────────────────────────────────────── */
const PREF_KEY = "lc_category_pref";
const PREF_DONE_KEY = "lc_onboarding_done";
type PrefChoice = "Gaming" | "Fitness" | "Both";

function OnboardingSurvey({ onChoose, onSkip }: { onChoose: (p: PrefChoice) => void; onSkip: () => void }) {
  return (
    <div className="onboarding-survey">
      <div className="min-w-0">
        <div className="onboarding-survey__title">
          What kind of challenges interest you?
        </div>
        <p className="onboarding-survey__desc">
          We&apos;ll show you the most relevant challenges first.
        </p>
        <div className="row-2 flex-wrap">
          {(["Gaming", "Fitness", "Both"] as PrefChoice[]).map((p) => (
            <button
              key={p}
              className="btn btn-outline btn-sm"
              onClick={() => onChoose(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={onSkip}
        className="onboarding-survey__skip"
      >
        Skip
      </button>
    </div>
  );
}

/* ── Filter pill ────────────────────────────────────────────────────────── */
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`filter-pill${active ? ' filter-pill--active' : ''}`}
    >
      {label}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
export default function Explore() {
  const chainId = useChainId();
  const router = useRouter();
  const { favorites, toggle: toggleFav, has: isFav } = useFavorites();

  /** data window */
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState<{ fromBlock: bigint; toBlock: bigint } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** view + facets */
  const [view, setView] = useState<"grid" | "table">("grid");
  const [tab, setTab] = useState<"forYou" | "trending" | "newest" | "endingSoon">("forYou");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");

  const [facetType, setFacetType] = useState<"ALL" | "Gaming" | "Fitness" | "Social" | "Custom">("ALL");

  // onboarding survey
  const [showSurvey, setShowSurvey] = useState(false);
  useEffect(() => {
    try {
      const done = localStorage.getItem(PREF_DONE_KEY);
      if (!done) setShowSurvey(true);
      const saved = localStorage.getItem(PREF_KEY) as PrefChoice | null;
      if (saved === "Gaming") setFacetType("Gaming");
      else if (saved === "Fitness") setFacetType("Fitness");
    } catch {}
  }, []);

  function handlePrefChoice(p: PrefChoice) {
    try {
      localStorage.setItem(PREF_KEY, p);
      localStorage.setItem(PREF_DONE_KEY, "1");
    } catch {}
    setShowSurvey(false);
    if (p === "Gaming") setFacetType("Gaming");
    else if (p === "Fitness") setFacetType("Fitness");
  }

  function handleSurveySkip() {
    try { localStorage.setItem(PREF_DONE_KEY, "1"); } catch {}
    setShowSurvey(false);
  }

  const [facetGame, setFacetGame] = useState<string | "ALL">("ALL");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  /** Off-chain metadata */
  const [meta, setMeta] = useState<Record<string, ChallengeMeta>>({});
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch("/api/challenges?ts=" + Date.now(), { cache: "no-store" });
        if (!res.ok) throw new Error(`/api/challenges ${res.status}`);
        const j = await res.json();
        const arr: ChallengeMeta[] = Array.isArray(j?.items) ? j.items : [];
        if (!stop) setMeta(Object.fromEntries(arr.map((m) => [String(m.id), m])));
      } catch (err) {
        console.warn("[explore] failed to load challenge metadata:", err);
      }
    })();
    return () => { stop = true; };
  }, []);

  function inferCategoryFromTextAndMeta(m?: ChallengeMeta, title?: string, desc?: string): Exclude<Category, "all"> {
    const cat = (m?.category || "").toLowerCase();
    if (["gaming","fitness","social","custom"].includes(cat)) return cat as any;
    const game = normalizeGame(m?.game);
    if (game && ["Dota 2","CS2","League of Legends","Valorant"].includes(game)) return "gaming";
    if (game && ["Running","Cycling","Hiking","Steps"].includes(game)) return "fitness";
    const t = `${title || ""} ${desc || ""}`.toLowerCase();
    if (/(dota|dota 2|league|lol|cs:?go|cs2|counter[- ]?strike|valorant|esports)/.test(t)) return "gaming";
    if (/(run|running|cycle|cycling|bike|steps|walk|hike|hiking|garmin|strava|fit)/.test(t)) return "fitness";
    if (/(friend|follow|social|lens|farcaster|twitter|x\.com)/.test(t)) return "social";
    return "custom";
  }

  function resolveCategory(m?: ChallengeMeta): Category {
    return inferCategoryFromTextAndMeta(m, m?.title, m?.description);
  }

  /* Mapper */
  function mapFromD1(data: ApiResponseD1): Row[] {
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((r) => {
      const m = meta[r.id];
      const tagArr: string[] = Array.isArray(m?.tags) ? (m!.tags as string[]) : [];
      const gameTag = tagArr.find((t: string) =>
        /dota|cs|counter[- ]?strike|league|valorant|apex|run|running|cycle|cycling|bike|hike|hiking|steps/i.test(t)
      );
      const game = normalizeGame((r as any).game ?? m?.game ?? gameTag ?? null);
      const mode = m?.mode ?? null;
      return {
        id: BigInt(r.id),
        creator: r.creator,
        blockNumber: BigInt(r.blockNumber),
        txHash: r.txHash,
        status: r.status,
        badges: {},
        category: resolveCategory(m),
        title: m?.title,
        description: m?.description,
        startTs: undefined,
        game,
        mode,
        tags: tagArr,
      };
    });
  }

  /* API fetcher */
  async function fetchDashboard(toBlock?: bigint) {
    const params = new URLSearchParams();
    params.set("span", DEFAULT_SPAN.toString());
    if (typeof toBlock === "bigint") params.set("toBlock", toBlock.toString());
    const res = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as ApiResponseD1;
    return {
      ok: res.ok,
      items: mapFromD1(data),
      dataFromBlock: data?.fromBlock ? BigInt(data.fromBlock) : 0n,
      dataToBlock: data?.toBlock ? BigInt(data.toBlock) : 0n,
      error: data?.error as string | undefined,
    };
  }

  const fetchWindow = useCallback(async (toBlock?: bigint) => {
    const ownMore = typeof toBlock === "bigint";
    ownMore ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const d1 = await fetchDashboard(toBlock);
      if (d1.error && !d1.items.length) setError(d1.error);
      setRange({ fromBlock: d1.dataFromBlock, toBlock: d1.dataToBlock });
      return d1.items;
    } catch (e: any) {
      setError(e?.message || String(e));
      return [] as Row[];
    } finally {
      ownMore ? setLoadingMore(false) : setLoading(false);
    }
  }, []);

  /** initial + live refresh */
  useEffect(() => {
    let stop = false;
    (async () => {
      const items = await fetchWindow();
      if (!stop) setRows((prev) => mergeByIdNewer(prev, items));
    })();
    return () => { stop = true; };
  }, [chainId, fetchWindow]);

  /** Enrich rows when metadata arrives */
  useEffect(() => {
    if (Object.keys(meta).length === 0) return;
    setRows((prev) =>
      prev.map((r) => {
        const m = meta[r.id.toString()];
        if (!m) return r;
        const tagArr = Array.isArray(m.tags) ? (m.tags as string[]) : [];
        return {
          ...r,
          title: m.title || r.title,
          description: m.description || r.description,
          category: resolveCategory(m),
          game: normalizeGame(m.game ?? null) ?? r.game,
          mode: m.mode ?? r.mode,
          tags: tagArr.length > 0 ? tagArr : (r.tags ?? []),
        };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // Live polling
  useInterval(() => {
    (async () => {
      if (!range) return;
      const latest = await fetchWindow(range.toBlock);
      if (!latest.length) return;
      setRows((prev) => mergeByIdNewer(prev, latest));
    })();
  }, 10_000);

  /** Infinite scroll */
  const olderSentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!olderSentinel.current) return;
    const node = olderSentinel.current;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore || !range || range.fromBlock === 0n) return;
        const olderTo = range.fromBlock > 0n ? range.fromBlock - 1n : 0n;
        const older = await fetchWindow(olderTo);
        if (!older.length) return;
        setRows((prev) => mergeByIdNewer(prev, older));
      },
      { rootMargin: "800px 0px 800px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [range, loadingMore, fetchWindow]);

  /** tallies */
  const tallies = useMemo(() => {
    const base: Record<Status, number> = { Active: 0, Finalized: 0, Canceled: 0 };
    for (const r of rows) base[r.status] += 1;
    return base;
  }, [rows]);

  /* on-chain status */
  const visibleIds = useMemo(() => rows.slice(0, 120).map((r) => r.id), [rows]);
  const statusCache = useChainStatusCache(visibleIds, 10_000);

  const rowsEffective = useMemo(() => {
    return rows.map((r) => {
      const s = statusCache[r.id.toString()];
      return s ? { ...r, status: s } : r;
    });
  }, [rows, statusCache]);

  /** personalization + filters */
  const favoritesSet = favorites;
  const forYouRank = useCallback(
    (r: Row) => {
      const fav = favoritesSet.has(r.id.toString()) ? 1 : 0;
      const likedGames = new Set(
        rows
          .filter((x) => favoritesSet.has(x.id.toString()))
          .map((x) => (normalizeGame(x.game || "") || "").toLowerCase())
      );
      const rGame = (normalizeGame(r.game || "") || "").toLowerCase();
      const gameBoost = likedGames.size && rGame && likedGames.has(rGame) ? 1 : 0;
      const statusBoost = r.status === "Active" ? 1 : 0;
      return fav * 100 + gameBoost * 10 + statusBoost * 5 + Number(r.blockNumber % 1000n);
    },
    [favoritesSet, rows]
  );

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    let set = rowsEffective;

    if (statusFilter !== "ALL") set = set.filter((r) => r.status === statusFilter);
    if (onlyFavorites) set = set.filter((r) => favoritesSet.has(r.id.toString()));

    if (facetType !== "ALL") {
      const t = facetType.toLowerCase();
      set = set.filter((r) => (r.category || "custom").toLowerCase() === t);
    }

    if (facetGame !== "ALL") set = set.filter((r) => matchesGame(facetGame, r.game));

    if (q) {
      set = set.filter((r) => {
        const idMatch = r.id.toString().includes(q);
        const creator = r.creator && isAddress(r.creator) ? r.creator.toLowerCase() : "";
        const creatorMatch = creator.includes(q);
        const titleMatch = (r.title || "").toLowerCase().includes(q);
        const gameMatch = (normalizeGame(r.game || "") || "").toLowerCase().includes(q);
        return idMatch || creatorMatch || titleMatch || gameMatch;
      });
    }

    switch (tab) {
      case "forYou":
        return [...set].sort((a, b) => forYouRank(b) - forYouRank(a));
      case "trending":
        return [...set].sort((a, b) => Number(b.blockNumber - a.blockNumber));
      case "endingSoon":
        return [...set].sort((a, b) => Number((a.startTs ?? 0n) - (b.startTs ?? 0n)));
      case "newest":
      default:
        return [...set].sort((a, b) => Number(b.blockNumber - a.blockNumber));
    }
  }, [rowsEffective, filterQuery, statusFilter, facetType, facetGame, onlyFavorites, tab, forYouRank, favoritesSet]);

  /** Apple TV style grouping */
  const grouped = useMemo(() => {
    const by: Record<string, Row[]> = {};
    const push = (k: string, r: Row) => ((by[k] ||= []).push(r));
    for (const r of filtered) {
      const g = normalizeGame(r.game || "");
      if (g && ["Dota 2", "CS2", "Valorant", "League of Legends"].includes(g)) push(g, r);
      else if (r.category === "fitness") {
        const t = (r.tags || []).join(" ").toLowerCase();
        if (/run|running/.test(t)) push("Running", r);
        else if (/hike|hiking/.test(t)) push("Hiking", r);
        else if (/cycle|cycling|bike/.test(t)) push("Cycling", r);
        else if (/walk|steps/.test(t)) push("Steps", r);
        else push("Fitness", r);
      } else push("Other", r);
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => Number(b.blockNumber - a.blockNumber));
    const order = ["Dota 2", "CS2", "Valorant", "League of Legends", "Running", "Cycling", "Hiking", "Steps", "Fitness", "Other"];
    return Object.fromEntries(Object.entries(by).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])));
  }, [filtered]);

  /* ── Sort tabs ──────────────────────────────────────────────────────────── */
  const sortTabs: { key: typeof tab; label: string }[] = [
    { key: "forYou", label: "For You" },
    { key: "trending", label: "Trending" },
    { key: "newest", label: "Newest" },
    { key: "endingSoon", label: "Ending Soon" },
  ];

  /* ── Active filter count (for clear button) ────────────────────────────── */
  const activeFilters = [
    statusFilter !== "ALL",
    facetType !== "ALL",
    facetGame !== "ALL",
    onlyFavorites,
    filterQuery.trim() !== "",
  ].filter(Boolean).length;

  function clearAllFilters() {
    setFacetType("ALL");
    setFacetGame("ALL");
    setOnlyFavorites(false);
    setFilterQuery("");
    setStatusFilter("ALL");
  }

  /* ── Controls (passed to header) ────────────────────────────────────────── */
  const controls = (
    <div className="stack-3">
      {/* Sort tabs */}
      <div className="segmented-control">
        {sortTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`segmented-control__btn${tab === key ? ' segmented-control__btn--active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + view toggle row */}
      <div className="row-2">
        <input
          className="input flex-1"
          placeholder="Search by title, game, or creator\u2026"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <div className="view-toggle">
          {(["grid", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              title={v === "grid" ? "Grid view" : "Table view"}
              className={`view-toggle__btn${view === v ? ' view-toggle__btn--active' : ''}`}
            >
              {v === "grid" ? "\u229E" : "\u2630"}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div className="result-count">
        <span>
          {filtered.length} challenge{filtered.length !== 1 ? "s" : ""}
          {filtered.length < rowsEffective.length ? ` of ${rowsEffective.length}` : ""}
        </span>
        {activeFilters > 0 && (
          <button
            onClick={clearAllFilters}
            className="btn-link"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && rowsEffective.length === 0 && (
        <div className="alert-banner alert-banner--error">
          API: {error}
        </div>
      )}
    </div>
  );

  return (
    <div className="stack-6">
      <Breadcrumb items={[{ label: "Explore" }]} />

      <ExploreHeader chainId={chainId} tallies={tallies} controls={controls} />

      {showSurvey && (
        <OnboardingSurvey onChoose={handlePrefChoice} onSkip={handleSurveySkip} />
      )}

      {/* Horizontal filter pills */}
      <div className="stack-3">
        {/* Category */}
        <div className="filter-row">
          <span className="filter-row__label">Type</span>
          {["All", "Gaming", "Fitness", "Social", "Custom"].map((g) => (
            <FilterPill
              key={g}
              label={g}
              active={(facetType === "ALL" && g === "All") || (facetType !== "ALL" && g.toLowerCase() === facetType.toLowerCase())}
              onClick={() => setFacetType(g === "All" ? "ALL" : (g as any))}
            />
          ))}
        </div>

        {/* Status */}
        <div className="filter-row">
          <span className="filter-row__label">Status</span>
          {["All", "Active", "Finalized", "Canceled"].map((s) => (
            <FilterPill
              key={s}
              label={s}
              active={(statusFilter === "ALL" && s === "All") || statusFilter === s}
              onClick={() => setStatusFilter(s === "All" ? "ALL" : (s as Status))}
            />
          ))}
        </div>

        {/* Games (only show when Gaming type is selected or ALL) */}
        {(facetType === "ALL" || facetType === "Gaming") && (
          <div className="filter-row">
            <span className="filter-row__label">Game</span>
            {["All", "Dota 2", "CS2", "League of Legends", "Valorant", "Other"].map((g) => (
              <FilterPill
                key={g}
                label={g}
                active={(facetGame === "ALL" && g === "All") || (facetGame !== "ALL" && g.toLowerCase() === facetGame.toLowerCase())}
                onClick={() => setFacetGame(g === "All" ? "ALL" : g)}
              />
            ))}
          </div>
        )}

        {/* Favorites toggle */}
        <div className="row-2">
          <FilterPill
            label={`\u2605 Favorites${onlyFavorites ? " (on)" : ""}`}
            active={onlyFavorites}
            onClick={() => setOnlyFavorites((v) => !v)}
          />
        </div>
      </div>

      {/* Content */}
      {view === "grid" ? (
        <div className="stack-6">
          {loading && (
            <div className="shimmer-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton-card"
                  style={{ height: 200 }}
                />
              ))}
            </div>
          )}

          {!loading && Object.keys(grouped).length === 0 && (
            <EmptyState
              title="No challenges found"
              description={
                rowsEffective.length > 0
                  ? "No challenges match your current filters. Try broadening your search."
                  : "No challenges have been created on-chain yet. Be the first!"
              }
              actionLabel={rowsEffective.length > 0 ? "Clear filters" : "Create a challenge"}
              onAction={rowsEffective.length > 0 ? clearAllFilters : () => { window.location.href = "/challenges/create"; }}
            />
          )}

          {!loading && Object.entries(grouped).map(([title, items]) => (
            <SectionCarousel key={title} title={title}>
              {items.map((r) => (
                <div key={`${r.id.toString()}-${r.txHash}`}>
                  <ChallengeCard
                    id={r.id}
                    title={r.title}
                    description={r.description}
                    status={r.status}
                    startTs={r.startTs}
                    badges={r.badges}
                    game={r.game || undefined}
                    mode={r.mode || undefined}
                    onOpen={() => router.push(`/challenge/${r.id.toString()}`)}
                    isFavorite={isFav(r.id.toString())}
                    onToggleFavorite={() => toggleFav(r.id.toString())}
                  />
                </div>
              ))}
            </SectionCarousel>
          ))}

          <div ref={olderSentinel} style={{ height: 56 }} />
        </div>
      ) : (
        /* Table view */
        <div className="table-container">
          {loading && (
            <div className="p-6 text-small color-muted">
              Loading\u2026
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="empty-filter">
              No challenges match your filters.{" "}
              <button
                onClick={clearAllFilters}
                className="btn-link"
              >
                Clear filters
              </button>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table table--compact" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th style={{ width: 260 }}>Title</th>
                    <th style={{ width: 160 }}>Game / Mode</th>
                    <th style={{ width: 140 }}>Creator</th>
                    <th style={{ width: 100 }}>Block</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ width: 50 }}>Fav</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const idStr = r.id.toString();
                    const statusTone = r.status === "Active" ? "success" : r.status === "Finalized" ? "accent" : "warning";
                    return (
                      <tr key={`${r.txHash}-${idStr}`}>
                        <td>
                          <a href={`/challenge/${idStr}`} className="color-accent" style={{ textDecoration: "none" }}>
                            #{idStr}
                          </a>
                        </td>
                        <td className="text-ellipsis text-nowrap overflow-hidden" style={{ maxWidth: 260 }}>
                          {r.title || "\u2014"}
                        </td>
                        <td>
                          <span className="text-caption">
                            {normalizeGame(r.game) || "\u2014"}
                            {r.mode && <span className="color-muted" style={{ marginLeft: 4 }}>\u00B7 {r.mode}</span>}
                          </span>
                        </td>
                        <td>
                          {r.creator ? (
                            <a href={addressUrl(r.creator)} target="_blank" rel="noreferrer" className="color-accent text-caption" style={{ textDecoration: "none", fontFamily: "monospace" }}>
                              {r.creator.slice(0, 6)}\u2026{r.creator.slice(-4)}
                            </a>
                          ) : (
                            "\u2014"
                          )}
                        </td>
                        <td>
                          <a href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer" className="color-accent text-caption" style={{ textDecoration: "none", fontFamily: "monospace" }}>
                            {r.blockNumber.toString()}
                          </a>
                        </td>
                        <td>
                          <Badge variant="tone" tone={statusTone} size="sm">{r.status}</Badge>
                        </td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFav(idStr); }}
                            className={`fav-btn${isFav(idStr) ? ' fav-btn--active' : ''}`}
                            title="Favorite"
                          >
                            ★
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div ref={olderSentinel} style={{ height: 56 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
