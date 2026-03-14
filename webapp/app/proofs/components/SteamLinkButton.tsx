"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

type Props = {
  subject?: `0x${string}`;
  className?: string;
  onLinked?: () => void;
  loadingExternal?: boolean;
  currentBinding?: { platformId: string; handle?: string | null } | null;
};

const isHex = (s?: string): s is `0x${string}` => !!s && /^0x[a-fA-F0-9]{40}$/.test(s);

export default function SteamLinkButton({ subject, className="", onLinked, loadingExternal=false, currentBinding }: Props) {
  const { address } = useAccount();
  const wallet = subject ?? (address as `0x${string}` | undefined);
  const [routeStatus, setRouteStatus] = useState<"idle"|"ok"|"error"|"server_config">("idle");

  useEffect(() => {
    const u = new URL(window.location.href);
    const s = u.searchParams.get("steam");
    if (s) {
      setRouteStatus(s === "ok" ? "ok" : s === "server_config" ? "server_config" : "error");
      u.searchParams.delete("steam");
      window.history.replaceState({}, "", u.toString());
      if (s === "ok") onLinked?.();
    }
  }, [onLinked]);

  const startLink = () => {
    if (!isHex(wallet)) return alert("Connect your wallet first.");
    const url = new URL("/api/auth/steam", window.location.origin);
    url.searchParams.set("subject", wallet);
    window.location.href = url.toString();
  };

  const linkedText = currentBinding
    ? `Linked SteamID64: ${currentBinding.platformId}${currentBinding.handle ? ` — ${currentBinding.handle}` : ""}`
    : "No Steam account linked yet.";

  return (
    <div className={["rounded-2xl border border-(--border) bg-(--surface-1) p-3", className].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          {loadingExternal ? <span className="text-(--text-muted)">Loading Steam status…</span> : linkedText}
          {routeStatus === "ok" && <span className="ml-2 tone-ok rounded px-1 py-0.5 border">Linked</span>}
          {routeStatus === "error" && <span className="ml-2 tone-warn rounded px-1 py-0.5 border">Steam auth error</span>}
          {routeStatus === "server_config" && <span className="ml-2 tone-warn rounded px-1 py-0.5 border">Server key missing</span>}
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-(--border) px-3 py-1.5 hover:bg-(--surface-2)" onClick={startLink}>
            {currentBinding ? "Relink" : "Link Steam"}
          </button>
          {currentBinding && (
            <a className="text-xs text-(--text-muted) underline hover:no-underline"
               href={`https://steamcommunity.com/profiles/${currentBinding.platformId}`} target="_blank" rel="noreferrer">
              View Profile
            </a>
          )}
        </div>
      </div>
    </div>
  );
}