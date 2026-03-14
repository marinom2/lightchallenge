"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChainId } from "wagmi";
import type { Address } from "viem";
import { isAddress } from "viem";
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer";
import { useInterval } from "@/lib/ui/useInterval";
import type { ChallengeMeta } from "@/lib/types/challenge";

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
function inferCategoryFromText(title?: string, desc?: string): Exclude<Category, "all"> {
  const t = `${title || ""} ${desc || ""}`.toLowerCase();
  if (/(dota|dota 2|league|lol|cs:?go|cs2|counter[- ]?strike|valorant|match|kills|win ?rate|esports)/.test(t)) return "gaming";
  if (/(apple|health|steps|strava|garmin|fit|run|cycle|cycling|bike|hike|hiking|walk)/.test(t)) return "fitness";
  if (/(friend|follow|social|lens|farcaster|twitter|x\.com)/.test(t)) return "social";
  return "custom";
}
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

function statusChipClass(s: Status) {
  switch (s) {
    case "Active":
      return "chip chip--ok";
    case "Finalized":
      return "chip chip--info";
    case "Canceled":
      return "chip chip--warn";
    default:
      return "chip";
  }
}

/** merge helper: keep newest row per id */
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

function OnboardingSurvey({
  onChoose,
  onSkip,
}: {
  onChoose: (p: PrefChoice) => void;
  onSkip: () => void;
}) {
  return (
    <div className="panel p-5 border border-(--accent)/30" style={{ background: "color-mix(in oklab, var(--card) 90%, var(--accent) 6%)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold mb-1">What kind of challenges interest you?</div>
          <p className="text-xs text-(--text-muted) mb-4">
            We'll show you the most relevant challenges first. You can change this any time using the sidebar.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["Gaming", "Fitness", "Both"] as PrefChoice[]).map((p) => (
              <button
                key={p}
                className="btn btn-outline btn-sm"
                onClick={() => onChoose(p)}
              >
                {p === "Gaming" ? "🎮 Gaming" : p === "Fitness" ? "🏃 Fitness" : "🌟 Both"}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm shrink-0 text-(--text-muted)"
          onClick={onSkip}
          title="Skip"
        >
          Skip
        </button>
      </div>
    </div>
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

  // facets
  const [facetType, setFacetType] = useState<"ALL" | "Gaming" | "Fitness" | "Social" | "Custom">("ALL");

  // onboarding survey
  const [showSurvey, setShowSurvey] = useState(false);
  useEffect(() => {
    try {
      const done = localStorage.getItem(PREF_DONE_KEY);
      if (!done) setShowSurvey(true);
      // Apply saved preference if exists
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
    // "Both" keeps facetType as "ALL"
  }

  function handleSurveySkip() {
    try { localStorage.setItem(PREF_DONE_KEY, "1"); } catch {}
    setShowSurvey(false);
  }
  const [facetGame, setFacetGame] = useState<string | "ALL">("ALL");
  const [facetMode, setFacetMode] = useState<string | "ALL">("ALL");
  const [facetTier, setFacetTier] = useState<string | "ALL">("ALL");
  const [facetDuration, setFacetDuration] = useState<string | "ALL">("ALL");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // mini-search
  const [filterQuery, setFilterQuery] = useState("");

  /** Off-chain metadata (category/game/mode/tags/title/description) */
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
    return () => {
      stop = true;
    };
  }, []);


  function inferCategoryFromTextAndMeta(m?: ChallengeMeta, title?: string, desc?: string): Exclude<Category, "all"> {
    // strong hints from meta first
    const cat = (m?.category || "").toLowerCase();
    if (["gaming","fitness","social","custom"].includes(cat)) return cat as any;
  
    const game = normalizeGame(m?.game);
    if (game && ["Dota 2","CS2","League of Legends","Valorant"].includes(game)) return "gaming";
    if (game && ["Running","Cycling","Hiking","Steps"].includes(game)) return "fitness";
  
    // fallback to text inference
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

  /* unified window fetch */
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

  /** initial + live refresh of the current window */
  useEffect(() => {
    let stop = false;
    (async () => {
      const items = await fetchWindow();
      if (!stop) setRows((prev) => mergeByIdNewer(prev, items));
    })();
    return () => {
      stop = true;
    };
  }, [chainId, fetchWindow]);

  /** When metadata arrives, enrich existing rows in-place (fixes stale closure in fetchWindow) */
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

  // Live polling — merge by ID
  useInterval(() => {
    (async () => {
      if (!range) return;
      const latest = await fetchWindow(range.toBlock);
      if (!latest.length) return;
      setRows((prev) => mergeByIdNewer(prev, latest));
    })();
  }, 10_000);

  /** Infinite scroll for older */
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

  /* authoritative on-chain status */
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
    if (facetMode !== "ALL") set = set.filter((r) => (r.mode || "").toLowerCase() === facetMode.toLowerCase());
    if (facetTier !== "ALL") set = set.filter((r) => (r.tags || []).some((t) => t.toLowerCase() === facetTier.toLowerCase()));
    if (facetDuration !== "ALL") set = set.filter((r) => (r.tags || []).some((t) => t.toLowerCase() === facetDuration.toLowerCase()));

    if (q) {
      const byQ = (r: Row) => {
        const idMatch = r.id.toString().includes(q);
        const creator = r.creator && isAddress(r.creator) ? r.creator.toLowerCase() : "";
        const creatorMatch = creator.includes(q);
        const titleMatch = (r.title || "").toLowerCase().includes(q);
        const gameMatch = (normalizeGame(r.game || "") || "").toLowerCase().includes(q);
        return idMatch || creatorMatch || titleMatch || gameMatch;
      };
      set = set.filter(byQ);
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
  }, [
    rowsEffective,
    filterQuery,
    statusFilter,
    facetType,
    facetGame,
    facetMode,
    facetTier,
    facetDuration,
    onlyFavorites,
    tab,
    forYouRank,
    favoritesSet,
  ]);

  /* Controls (header) — simplified: tab + search + view toggle only */
  const controls = (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="segmented" role="tablist" aria-label="Explore sections">
        {[
          ["forYou",    "For You"],
          ["trending",  "Trending"],
          ["newest",    "Newest"],
          ["endingSoon","Ending soon"],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`segmented__btn ${tab === k ? "is-active" : ""}`}
            aria-checked={tab === (k as any)}
            role="tab"
            onClick={() => setTab(k as any)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex gap-2 items-center">
        <input
          className="input flex-1"
          placeholder="Search by title, game, or creator…"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <div className="segmented shrink-0" aria-label="View">
          <button
            className={`segmented__btn ${view === "grid" ? "is-active" : ""}`}
            aria-checked={view === "grid"}
            onClick={() => setView("grid")}
            title="Grid view"
          >
            ⊞
          </button>
          <button
            className={`segmented__btn ${view === "table" ? "is-active" : ""}`}
            aria-checked={view === "table"}
            onClick={() => setView("table")}
            title="Table view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Result count + error */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-(--text-muted)">
          {filtered.length} challenge{filtered.length !== 1 ? "s" : ""}
          {filtered.length < rowsEffective.length ? ` of ${rowsEffective.length}` : ""}
        </div>
        {onlyFavorites && (
          <button
            className="text-xs text-(--text-muted) hover:text-(--text) underline underline-offset-2"
            onClick={() => setOnlyFavorites(false)}
          >
            Clear favorites filter
          </button>
        )}
      </div>

      {error && rowsEffective.length === 0 && (
        <div className="chip chip--bad">API: {error}</div>
      )}
    </div>
  );

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

  return (
    <div className="container-narrow py-6 space-y-6">
      <ExploreHeader chainId={chainId} tallies={tallies} controls={controls} />

      {showSurvey && (
        <OnboardingSurvey onChoose={handlePrefChoice} onSkip={handleSurveySkip} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Sidebar */}
        <aside className="hidden md:block md:col-span-3">
          <div className="category-zone">
            <div className="sidebar-title">Type</div>
            <div className="pill-grid">
              {["All", "Gaming", "Fitness", "Social", "Custom"].map((g) => {
                const on = (facetType === "ALL" && g === "All") || (facetType !== "ALL" && g.toLowerCase() === facetType.toLowerCase());
                return (
                  <button key={g} className={`pill-toggle ${on ? "is-active" : ""}`} onClick={() => setFacetType(g === "All" ? "ALL" : (g as any))}>
                    <span className="label">{g}</span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-divider" />
            <div className="sidebar-title">Games</div>
            <div className="pill-grid">
              {["All", "Dota 2", "CS2", "League of Legends", "Valorant", "Other"].map((g) => {
                const on = (facetGame === "ALL" && g === "All") || (facetGame !== "ALL" && g.toLowerCase() === facetGame.toLowerCase());
                return (
                  <button key={g} className={`pill-toggle ${on ? "is-active" : ""}`} onClick={() => setFacetGame(g === "All" ? "ALL" : g)}>
                    <span className="label">{g}</span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-divider" />
            <div className="sidebar-title">Modes</div>
            <div className="pill-grid">
              {["All", "Kills", "Ranked", "Winrate", "Speedrun", "Solo", "Duo", "Team"].map((m) => {
                const on = (facetMode === "ALL" && m === "All") || (facetMode !== "ALL" && m.toLowerCase() === facetMode.toLowerCase());
                return (
                  <button key={m} className={`pill-toggle ${on ? "is-active" : ""}`} onClick={() => setFacetMode(m === "All" ? "ALL" : m)}>
                    <span className="label">{m}</span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-divider" />
            <div className="sidebar-title">Tier</div>
            <div className="pill-grid">
              {["All", "Beginner", "Intermediate", "Advanced", "Pro"].map((t) => {
                const on = (facetTier === "ALL" && t === "All") || (facetTier !== "ALL" && t.toLowerCase() === facetTier.toLowerCase());
                return (
                  <button key={t} className={`pill-toggle ${on ? "is-active" : ""}`} onClick={() => setFacetTier(t === "All" ? "ALL" : t)}>
                    <span className="label">{t}</span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-divider" />
            <div className="sidebar-title">Duration</div>
            <div className="pill-grid">
              {["All", "<30m", "Daily", "Weekend", "Season"].map((d) => {
                const on = (facetDuration === "ALL" && d === "All") || (facetDuration !== "ALL" && d.toLowerCase() === facetDuration.toLowerCase());
                return (
                  <button key={d} className={`pill-toggle ${on ? "is-active" : ""}`} onClick={() => setFacetDuration(d === "All" ? "ALL" : d)}>
                    <span className="label">{d}</span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-divider" />
            <button className={`pill-toggle ${onlyFavorites ? "is-active" : ""}`} onClick={() => setOnlyFavorites((v) => !v)}>
              <span className="label">★ Favorites</span>
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="md:col-span-9 space-y-6">
          {view === "grid" ? (
            <>
              {Object.keys(grouped).length === 0 && (
                <div className="panel p-8 text-center space-y-4">
                  <div className="text-lg font-semibold">No challenges found</div>
                  <p className="text-sm text-(--text-muted) max-w-md mx-auto">
                    {rowsEffective.length > 0
                      ? "No challenges match your current filters. Try broadening your search or changing the category."
                      : "No challenges have been created on-chain yet. Be the first to create one!"}
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {rowsEffective.length > 0 && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setFacetType("ALL");
                          setFacetGame("ALL");
                          setFacetMode("ALL");
                          setFacetTier("ALL");
                          setFacetDuration("ALL");
                          setOnlyFavorites(false);
                          setFilterQuery("");
                          setStatusFilter("ALL");
                        }}
                      >
                        Clear all filters
                      </button>
                    )}
                    <a href="/challenges/create" className="btn btn-primary">Create a challenge</a>
                  </div>
                </div>
              )}
              {Object.entries(grouped).map(([title, items]) => (
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
              <div ref={olderSentinel} className="h-14" />
            </>
          ) : (
            <div className="panel">
              <div className="panel-header">
                <div className="font-semibold">
                  Recent Challenges · <span className="text-(--text-muted)">newest first · compact glass table</span>
                </div>
              </div>
              <div className="panel-body">
                {loading && <div className="text-(--text-muted) text-sm">Loading…</div>}
                {!loading && filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-(--text-muted)">
                    No challenges match your filters.{" "}
                    <button className="underline underline-offset-2" onClick={() => { setFacetType("ALL"); setFacetGame("ALL"); setFilterQuery(""); setStatusFilter("ALL"); }}>
                      Clear filters
                    </button>
                  </div>
                )}
                {!loading && filtered.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table table--compact glass-shadow" style={{ minWidth: 1120 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>ID</th>
                          <th style={{ width: 300 }}>Title</th>
                          <th style={{ width: 180 }}>Game / Mode</th>
                          <th style={{ width: 160 }}>Creator</th>
                          <th style={{ width: 140 }}>Block</th>
                          <th style={{ width: 220 }}>Tx</th>
                          <th style={{ width: 140 }}>Status</th>
                          <th style={{ width: 300 }}>Badges / Tags</th>
                          <th style={{ width: 60 }}>Fav</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const idStr = r.id.toString();
                          const b = r.badges || {};
                          return (
                            <tr key={`${r.txHash}-${idStr}`} className="align-middle hover:bg-white/5 transition-colors">
                              <td>
                                <a className="link" href={`/challenge/${idStr}`}>
                                  #{idStr}
                                </a>
                              </td>
                              <td className="truncate max-w-[300px]">{r.title || "—"}</td>
                              <td className="truncate">
                                <div className="flex gap-1 items-center">
                                  <span className="chip">{normalizeGame(r.game) || "—"}</span>
                                  {r.mode && <span className="chip chip--info">{r.mode}</span>}
                                </div>
                              </td>
                              <td>
                                {r.creator ? (
                                  <a className="link" href={addressUrl(r.creator)} target="_blank" rel="noreferrer">
                                    {r.creator.slice(0, 6)}…{r.creator.slice(-4)}
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                <a className="link" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                                  {r.blockNumber.toString()}
                                </a>
                              </td>
                              <td>
                                <a className="link mono" href={txUrl(r.txHash)} target="_blank" rel="noreferrer">
                                  {r.txHash.slice(0, 14)}…
                                </a>
                              </td>
                              <td>
                                <span className={statusChipClass(r.status)}>{r.status}</span>
                              </td>
                              <td>
                                <div className="flex gap-2 flex-wrap">
                                  {(r.tags || []).slice(0, 4).map((t) => (
                                    <span key={t} className="chip">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td>
                                <button className={`icon-btn star ${isFav(idStr) ? "is-fav" : ""}`} onClick={() => toggleFav(idStr)} title="Favorite">
                                  ★
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div ref={olderSentinel} className="h-14" />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}