// webapp/components/dota/DotaCard.tsx
"use client";

import React from "react";
import MedalIcon, { rankTierToMedal } from "./MedalIcon";

type Line = { label: string; value: string };

export type FeaturedHero = {
  id: number;
  name?: string;
  icon?: string | null;
};

export type DotaEvalPayload = {
  uiCard?: {
    title?: string;
    subtitle?: string;
    avatar?: string | null;
    lines?: Line[];
    profileUrl?: string;
  };
  profile?: {
    profile?: {
      account_id?: number;
      personaname?: string;
      avatarfull?: string | null;
      last_login?: string | null;
      loccountrycode?: string | null;
      profileurl?: string | null;
    };
    rank_tier?: number | null;
    mmr_estimate?: { estimate?: number | null };
    leaderboard_rank?: number | null;
  };
  featuredHero?: FeaturedHero | null;
  success: boolean;
  steam32: string;
};

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────────────── */
export function DotaCardSkeleton() {
  return (
    <div className="rounded-2xl border border-(--border) bg-soft p-4 md:p-5 shadow-lg animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-soft" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 bg-soft rounded" />
          <div className="h-3 w-32 bg-soft rounded" />
        </div>
        <div className="h-6 w-24 rounded-full bg-soft" />
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl bg-soft border border-(--border) px-3 py-2"
          >
            <span className="h-3 w-16 bg-soft rounded" />
            <span className="h-3 w-12 bg-soft rounded" />
          </div>
        ))}
      </div>
      <div className="mt-4 h-3 w-28 bg-soft rounded" />
    </div>
  );
}

function Dot() {
  return (
    <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-(--soft-bg-14) align-middle" />
  );
}

function steam32To64(steam32?: string): string {
  try {
    if (!steam32) return "";
    const base = BigInt("76561197960265728");
    return (BigInt(steam32) + base).toString();
  } catch {
    return "";
  }
}

function prettyHeroName(name?: string) {
  if (!name) return undefined;
  const cleaned = name
    .replace(/^npc_dota_hero_/, "")
    .replace(/_/g, " ");
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ────────────────────────────────────────────────────────────────────────────
   Main Card
   ─────────────────────────────────────────────────────────────────────────── */
export default function DotaCard({ data }: { data: DotaEvalPayload }) {
  const prof = data?.profile;
  const ui = data?.uiCard ?? {};
  const lines: Line[] = Array.isArray(ui.lines) ? ui.lines : [];

  // Prefer Steam first, then Dota, then default
  const steamName = ui.title?.trim();
  const dotaName = prof?.profile?.personaname?.trim();
  const title = steamName || dotaName || "Dota 2 Player";

  const steamAvatar = ui.avatar ?? null;
  const dotaAvatar = prof?.profile?.avatarfull ?? null;
  const avatar = steamAvatar || dotaAvatar;

  const subtitle =
    ui.subtitle ??
    (steamName
      ? "Steam profile"
      : dotaName
      ? "Dota 2 profile"
      : "Dota 2 profile");

  const openDotaUrl = data?.steam32
    ? `https://www.opendota.com/players/${data.steam32}`
    : "";
  const steam64 = steam32To64(data?.steam32);
  const steamUrl = steam64
    ? `https://steamcommunity.com/profiles/${steam64}`
    : "";
  const profileHref =
    ui.profileUrl ||
    prof?.profile?.profileurl ||
    openDotaUrl ||
    steamUrl ||
    "";

  const heroLabel = "Favourite Hero:";
  const medal = rankTierToMedal(prof?.rank_tier ?? null);

  return (
    <div className="rounded-2xl border border-(--border) bg-linear-to-b bg-soft p-4 md:p-5 shadow-[0_0_0_1px_rgba(109,40,217,0.15)]">
      {/* Header row */}
      <div className="flex items-center gap-4">
        {avatar ? (
          <img
            src={avatar}
            alt={title}
            className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-soft" />
        )}

        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold truncate flex items-center gap-2">
            <span className="truncate">{title}</span>
            {medal && (
              <div className="flex items-center gap-1">
                <MedalIcon medal={medal.medal} size={18} />
                {medal.stars > 0 && (
                  <span className="text-xs text-amber-300/90 leading-none">
                    {"★".repeat(Math.min(5, medal.stars))}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-sm text-zinc-400 flex items-center gap-1">
            {subtitle}
            {typeof prof?.leaderboard_rank === "number" &&
              prof.leaderboard_rank > 0 && (
                <>
                  <Dot />
                  <span className="text-indigo-300">
                    Leaderboard #{prof.leaderboard_rank}
                  </span>
                </>
              )}
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            data.success
              ? "bg-emerald-600/15 text-emerald-300 border-emerald-600/30"
              : "bg-rose-600/15 text-rose-300 border-rose-600/30"
          }`}
          title="Challenge pass/fail for the current evaluation"
        >
          {data.success ? "Challenge ✓" : "Challenge ✗"}
        </span>
      </div>

      {/* Favourite hero */}
      {data?.featuredHero && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-(--border) bg-soft px-3 py-2">
          {data.featuredHero.icon ? (
            <img
              src={data.featuredHero.icon}
              alt={
                prettyHeroName(data.featuredHero.name) ||
                `Hero ${data.featuredHero.id}`
              }
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded bg-soft grid place-items-center text-xs text-muted">
              🏹
            </div>
          )}
          <div className="text-sm text-zinc-300">
            <span className="font-medium">{heroLabel}</span>{" "}
            <span className="text-(--text)">
              {prettyHeroName(data.featuredHero.name) ||
                `#${data.featuredHero.id}`}
            </span>
          </div>
        </div>
      )}

      {/* Lines */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {lines.map((l, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl bg-soft border border-(--border) px-3 py-2"
          >
            <span className="text-zinc-400 text-sm">{l.label}</span>
            <span className="text-zinc-100 font-medium">{l.value}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <div>
          Steam32: <span className="font-mono">{data?.steam32 ?? "—"}</span>
        </div>
        {profileHref && (
          <a
            href={profileHref}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
          >
            Open profile
          </a>
        )}
      </div>
    </div>
  );
}