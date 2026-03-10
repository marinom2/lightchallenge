// webapp/app/settings/linked-accounts/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import DotaCard, { DotaEvalPayload } from "@/app/components/dota/DotaCard";

type EvalParams = {
  matches?: number;
  rankedOnly?: boolean;
  hero?: number | string;
  minWinRatePct?: number;
  minKills?: number;
};

export default function LinkedAccountsPage() {
  const { address } = useAccount();
  const [steamId, setSteamId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [dota, setDota] = useState<DotaEvalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Boot from localStorage first so returning users see an instant value
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("steamId64") : null;
    if (saved) setSteamId(saved);
  }, []);

  // If connected and no local value yet, ask the backend for bindings
  useEffect(() => {
    (async () => {
      if (!address) return;
      if (steamId) return; // keep user override/local value
      try {
        const res = await fetch(`/api/linked-accounts?wallet=${address}`);
        const json = await res.json();
        const id64 = json?.steam?.id64 as string | undefined;
        if (id64) {
          setSteamId(id64);
          localStorage.setItem("steamId64", id64);
          // Optional: immediately fetch their Dota profile
          fetchDota({ matches: 20, rankedOnly: true });
        }
      } catch {
        /* ignore; manual entry still works */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function fetchDota(p?: EvalParams) {
    if (!steamId) return;
    setLoading(true);
    setError(null);
    setDota(null);
    try {
      const res = await fetch("/api/dota/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          steamId,
          challengeId: "1",
          subject: "0x0000000000000000000000000000000000000000",
          params: {
            matches: p?.matches ?? 20,
            rankedOnly: p?.rankedOnly ?? true,
            hero: p?.hero,
            minWinRatePct: p?.minWinRatePct,
            minKills: p?.minKills,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");
      setDota(json);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  function saveSteam() {
    if (!steamId) return;
    localStorage.setItem("steamId64", steamId);
    fetchDota();
  }

  return (
    <div className="container">
      <header className="mb-4">
        <h1 className="h1">Linked Accounts</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Connect external game/fitness accounts to enable auto-verification.
        </p>
      </header>

      {/* Steam / Dota section */}
      <section className="panel">
        <div className="panel-header">
          <div className="font-semibold">Steam / Dota</div>
        </div>

        <div className="panel-body">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="steam-id" className="label">
                Steam ID64
              </label>
              <input
                id="steam-id"
                className="input w-full font-mono"
                placeholder="7656119XXXXXXXXXX"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value.trim())}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="help">Paste your 64-bit Steam ID (not a vanity name).</p>
            </div>

            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={saveSteam} disabled={!steamId}>
                Save
              </button>
              <button
                className={`btn ${loading ? "loading btn-primary" : "btn-primary"}`}
                onClick={() => fetchDota()}
                disabled={!steamId || loading}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {/* Quick presets */}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button className="chip" onClick={() => fetchDota({ matches: 50, rankedOnly: true })}>
              Ranked: last 50
            </button>
            <button className="chip" onClick={() => fetchDota({ matches: 20, rankedOnly: false })}>
              Any: last 20
            </button>
            <button
              className="chip"
              onClick={() => fetchDota({ matches: 50, rankedOnly: true, hero: 1, minKills: 100 })}
              title="Anti-Mage = 1"
            >
              AM 100 kills / 50 ranked
            </button>
            <button
              className="chip"
              onClick={() => fetchDota({ matches: 100, rankedOnly: true, minWinRatePct: 80 })}
            >
              80% WR / 100 ranked
            </button>
          </div>

          {error && (
            <div className="mt-3 text-sm" style={{ color: "var(--error)" }}>
              Error: {error}
            </div>
          )}

          <div className="mt-5">
            {dota ? (
              <DotaCard data={dota} />
            ) : (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                {address ? (
                  <>
                    If nothing shows up, paste your SteamID64 then click <b>Save</b> and <b>Refresh</b>.
                  </>
                ) : (
                  <>
                    Connect your wallet to auto-load linked accounts, or enter SteamID64 then click <b>Save</b>.
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}