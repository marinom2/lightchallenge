// lib/hooks/useDotaHeroes.ts
"use client";
import useSWR from "swr";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export function useDotaHeroes() {
  const { data, error, isLoading } = useSWR("/api/platforms/dota2/heroes", fetcher, { revalidateOnFocus: false });
  const heroes = Array.isArray(data?.heroes) ? data.heroes : [];
  // Return { value, label } list using localized_name when present
  const options = heroes.map((h: any) => ({
    value: (h?.name || "").replace("npc_dota_hero_", ""), // "antimage"
    label: h?.localized_name || h?.name || "Unknown",
    img: h?.img,
  }));
  return { options, isLoading, error };
}