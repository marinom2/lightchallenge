"use client";
import * as React from "react";
import { Activity, Mountain, Bike, Footprints } from "lucide-react";
import { siDota2, siCounterstrike, siValorant, siLeagueoflegends } from "simple-icons";

type Props = { name?: string | null; className?: string };

function SI({ svg, hex, title, className }: { svg: string; hex: string; title: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md p-[2px] bg-white/10 ${className ?? "w-5 h-5"}`}
      title={title}
      aria-label={title}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="#${hex}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">${svg}</svg>`,
      }}
    />
  );
}

export default function GameIcon({ name, className = "w-5 h-5" }: Props) {
  const n = (name || "").toLowerCase();

  // Games
  if (/\bdota\b|\bdota 2\b/.test(n))           return <SI svg={siDota2.svg}            hex={siDota2.hex}            title="Dota 2" className={className} />;
  if (/\bcs\b|cs2|counter[- ]?strike/.test(n)) return <SI svg={siCounterstrike.svg}    hex={siCounterstrike.hex}    title="Counter-Strike" className={className} />;
  if (/valorant/.test(n))                       return <SI svg={siValorant.svg}        hex={siValorant.hex}        title="Valorant" className={className} />;
  if (/league|lol|legends/.test(n))             return <SI svg={siLeagueoflegends.svg} hex={siLeagueoflegends.hex} title="League of Legends" className={className} />;

  // Fitness / IRL
  if (/running|runner|run/.test(n))   return <span title="Running" aria-label="Running"><Activity className={className} aria-hidden /></span>;
  if (/hiking|hike|trek/.test(n))     return <span title="Hiking" aria-label="Hiking"><Mountain className={className} aria-hidden /></span>;
  if (/cycling|bike|bicycle/.test(n)) return <span title="Cycling" aria-label="Cycling"><Bike className={className} aria-hidden /></span>;
  if (/steps|walking|walk/.test(n))   return <span title="Steps" aria-label="Steps"><Footprints className={className} aria-hidden /></span>;

  return null;
}