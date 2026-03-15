// webapp/app/settings/linked-accounts/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useSearchParams } from "next/navigation";
import DotaCard, { type DotaEvalPayload } from "@/app/components/dota/DotaCard";
import {
  FITNESS_PROVIDERS,
  GAMING_PROVIDERS,
  getDefaultFitnessProvider,
  setDefaultFitnessProvider,
  getDefaultGamingProvider,
  setDefaultGamingProvider,
} from "@/lib/fitnessProviders";

// ─── Types ──────────────────────────────────────────────────────────────────

type LinkedAccount = {
  id: string;
  provider: string;
  external_id: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type IdentityBinding = {
  platform: string;
  wallet: string;
  platformId: string;
  handle: string | null;
  ts: number;
};

// ─── Provider config ────────────────────────────────────────────────────────

type ProviderConfig = {
  key: string;
  label: string;
  description: string;
  linkMethod: "oauth" | "openid" | "manual";
  identityPlatform?: "steam" | "riot";
  linkedProvider?: string;
  manualLabel?: string;
  manualPlaceholder?: string;
  manualHelp?: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    key: "steam",
    label: "Steam / Dota 2",
    description: "Link via Steam sign-in to enable Dota 2 challenge verification.",
    linkMethod: "openid",
    identityPlatform: "steam",
    linkedProvider: "opendota",
  },
  {
    key: "strava",
    label: "Strava",
    description: "Connect your Strava account to auto-verify fitness challenges (running, cycling, etc.).",
    linkMethod: "oauth",
    linkedProvider: "strava",
  },
  {
    key: "fitbit",
    label: "Fitbit",
    description: "Connect your Fitbit account to auto-verify fitness challenges (steps, distance, heart rate).",
    linkMethod: "oauth",
    linkedProvider: "fitbit",
  },
  {
    key: "riot",
    label: "Riot / League of Legends",
    description: "Link your Riot PUUID to enable LoL challenge verification.",
    linkMethod: "manual",
    identityPlatform: "riot",
    linkedProvider: "riot",
    manualLabel: "Riot PUUID or Riot ID",
    manualPlaceholder: "Player#NA1  or  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    manualHelp:
      "Enter your Riot ID (e.g. Player#NA1) or paste a raw PUUID. We'll store the PUUID for match lookups.",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function LinkedAccountsPage() {
  const { address } = useAccount();
  const searchParams = useSearchParams();

  const stravaStatus = searchParams.get("strava");
  const steamStatus = searchParams.get("steam");
  const fitbitStatus = searchParams.get("fitbit");

  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [identities, setIdentities] = useState<Record<string, IdentityBinding | null>>({});
  const [loading, setLoading] = useState(true);

  const [dota, setDota] = useState<DotaEvalPayload | null>(null);
  const [dotaLoading, setDotaLoading] = useState(false);

  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [manualSaving, setManualSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Tracking preference
  const [fitnessPref, setFitnessPref] = useState<string | null>(null);
  const [gamingPref, setGamingPref] = useState<string | null>(null);
  useEffect(() => {
    setFitnessPref(getDefaultFitnessProvider());
    setGamingPref(getDefaultGamingProvider());
  }, []);

  // ── Fetch all linked data ──────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    setLoading(true);

    try {
      const laRes = await fetch(`/api/accounts/link?subject=${address}`);
      const laJson = await laRes.json();
      if (laJson.ok && Array.isArray(laJson.accounts)) {
        setLinked(laJson.accounts);
      }
    } catch {}

    for (const platform of ["steam", "riot"] as const) {
      try {
        const res = await fetch(`/api/linked-accounts?wallet=${address}&platform=${platform}`);
        const json = await res.json();
        setIdentities((prev) => ({ ...prev, [platform]: json.binding ?? null }));
      } catch {}
    }

    setLoading(false);
  }, [address]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Auto-fetch Dota card when steam binding exists ─────────────────────

  useEffect(() => {
    const steamBinding = identities.steam;
    if (!steamBinding?.platformId) return;

    try {
      const s64 = BigInt(steamBinding.platformId);
      const base = BigInt("76561197960265728");
      const s32 = (s64 - base).toString();
      setDotaLoading(true);
      fetch(`/api/platforms/dota2/card?steam64=${encodeURIComponent(steamBinding.platformId)}`)
        .then((r) => r.json())
        .then((json) => { if (json.success) setDota({ ...json, steam32: s32 }); })
        .catch(() => {})
        .finally(() => setDotaLoading(false));
    } catch {}
  }, [identities.steam]);

  // ── Helpers ────────────────────────────────────────────────────────────

  function isConnected(provider: ProviderConfig): boolean {
    if (provider.identityPlatform && identities[provider.identityPlatform]) return true;
    if (provider.linkedProvider && linked.some((a) => a.provider === provider.linkedProvider)) return true;
    return false;
  }

  function getExternalId(provider: ProviderConfig): string | null {
    if (provider.identityPlatform) {
      const binding = identities[provider.identityPlatform];
      if (binding) return binding.platformId;
    }
    if (provider.linkedProvider) {
      const account = linked.find((a) => a.provider === provider.linkedProvider);
      if (account?.external_id) return account.external_id;
    }
    return null;
  }

  function getHandle(provider: ProviderConfig): string | null {
    if (provider.identityPlatform) {
      return identities[provider.identityPlatform]?.handle ?? null;
    }
    return null;
  }

  // ── Link actions ───────────────────────────────────────────────────────

  function linkOAuth(provider: ProviderConfig) {
    if (!address) return;
    window.location.href = `/api/auth/${provider.key}?subject=${address}`;
  }

  function linkOpenID(provider: ProviderConfig) {
    if (!address) return;
    if (provider.key === "steam") {
      window.location.href = `/api/auth/steam?subject=${address}`;
    }
  }

  async function linkManual(provider: ProviderConfig) {
    if (!address) return;
    const value = (manualInputs[provider.key] ?? "").trim();
    if (!value) return;

    setManualSaving((p) => ({ ...p, [provider.key]: true }));
    setErrors((p) => ({ ...p, [provider.key]: "" }));

    try {
      let externalId = value;

      // For Riot: if input contains # treat as Riot ID, resolve to PUUID
      if (provider.key === "riot" && value.includes("#")) {
        const [gameName, tagLine] = value.split("#");
        if (!gameName || !tagLine) {
          setErrors((p) => ({ ...p, [provider.key]: 'Invalid format. Use "Name#Tag" or paste a PUUID.' }));
          return;
        }

        const resolveRes = await fetch(
          `/api/accounts/resolve-riot?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`
        );
        const resolveJson = await resolveRes.json();
        if (!resolveRes.ok || !resolveJson.puuid) {
          setErrors((p) => ({
            ...p,
            [provider.key]: resolveJson.error || "Could not resolve Riot ID. Try pasting your PUUID directly.",
          }));
          return;
        }
        externalId = resolveJson.puuid;
      }

      const res = await fetch("/api/accounts/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: address,
          provider: provider.linkedProvider,
          externalId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrors((p) => ({ ...p, [provider.key]: json.error || "Failed to link account" }));
        return;
      }

      setManualInputs((p) => ({ ...p, [provider.key]: "" }));
      await fetchAll();
    } catch (e: any) {
      setErrors((p) => ({ ...p, [provider.key]: e?.message || "Failed to link account" }));
    } finally {
      setManualSaving((p) => ({ ...p, [provider.key]: false }));
    }
  }

  async function unlinkProvider(provider: ProviderConfig) {
    if (!address) return;
    if (!confirm(`Unlink ${provider.label}?`)) return;

    try {
      if (provider.linkedProvider) {
        await fetch("/api/accounts/link", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: address, provider: provider.linkedProvider }),
        });
      }
      if (provider.identityPlatform) {
        await fetch(
          `/api/linked-accounts?wallet=${address}&platform=${provider.identityPlatform}`,
          { method: "DELETE" }
        );
      }
      await fetchAll();
    } catch {}
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="container">
      <header className="mb-4">
        <h1 className="h1">Linked Accounts</h1>
        <p className="mt-1 text-sm color-muted">
          Connect external game and fitness accounts to enable automatic proof collection.
        </p>
      </header>

      {/* Flash messages from OAuth callbacks */}
      {stravaStatus === "ok" && (
        <div className="mb-4 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-300">
          Strava account linked successfully.
        </div>
      )}
      {stravaStatus && stravaStatus !== "ok" && (
        <div className="mb-4 rounded-xl border border-rose-600/30 bg-rose-600/10 p-3 text-sm text-rose-300">
          Strava linking failed: {stravaStatus}
        </div>
      )}
      {steamStatus === "ok" && (
        <div className="mb-4 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-300">
          Steam account linked successfully.
        </div>
      )}
      {steamStatus && steamStatus !== "ok" && (
        <div className="mb-4 rounded-xl border border-rose-600/30 bg-rose-600/10 p-3 text-sm text-rose-300">
          Steam linking failed: {steamStatus}
        </div>
      )}
      {fitbitStatus === "ok" && (
        <div className="mb-4 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-300">
          Fitbit account linked successfully.
        </div>
      )}
      {fitbitStatus && fitbitStatus !== "ok" && (
        <div className="mb-4 rounded-xl border border-rose-600/30 bg-rose-600/10 p-3 text-sm text-rose-300">
          Fitbit linking failed: {fitbitStatus}
        </div>
      )}

      {!address && (
        <div className="mb-5 rounded-xl border border-(--glass-border) bg-(--glass) p-4 text-sm">
          Connect your wallet to manage linked accounts.
        </div>
      )}

      {/* Why link? */}
      <div className="mb-5 rounded-xl border border-(--glass-border) bg-(--glass) p-4 text-sm">
        <div className="font-semibold mb-1">Why link an account?</div>
        <ul className="space-y-1 text-(--text-muted) list-disc list-inside">
          <li>Submit evidence automatically — no manual proof upload needed</li>
          <li>Your stats (wins, rank, steps, distance) are fetched and verified on-chain</li>
          <li>Required for gaming challenges that need a verified platform identity</li>
        </ul>
      </div>

      {/* Provider sections */}
      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const connected = isConnected(provider);
          const extId = getExternalId(provider);
          const handle = getHandle(provider);

          return (
            <section key={provider.key} className="panel">
              <div className="panel-header flex items-center justify-between">
                <div className="font-semibold">{provider.label}</div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    connected
                      ? "bg-emerald-600/15 text-emerald-300 border-emerald-600/30"
                      : "bg-zinc-600/15 text-zinc-400 border-zinc-600/30"
                  }`}
                >
                  {connected ? "Connected" : "Not connected"}
                </span>
              </div>

              <div className="panel-body">
                <p className="text-sm mb-3 color-muted">
                  {provider.description}
                </p>

                {/* Connected state: show ID + unlink */}
                {connected && (
                  <div className="flex items-center justify-between rounded-xl border border-(--border) bg-soft px-3 py-2 mb-3">
                    <div className="text-sm">
                      {handle && <span className="font-medium mr-2">{handle}</span>}
                      {extId && (
                        <span className="font-mono text-xs color-muted">
                          {extId.length > 24 ? `${extId.slice(0, 10)}...${extId.slice(-8)}` : extId}
                        </span>
                      )}
                      {!handle && !extId && (
                        <span className="color-muted">Linked</span>
                      )}
                    </div>
                    <button
                      className="btn btn-sm text-xs color-danger"
                      onClick={() => unlinkProvider(provider)}
                    >
                      Unlink
                    </button>
                  </div>
                )}

                {/* Link actions based on method */}
                {!connected && address && (
                  <>
                    {provider.linkMethod === "oauth" && (
                      <button className="btn btn-primary" onClick={() => linkOAuth(provider)}>
                        Connect {provider.label}
                      </button>
                    )}

                    {provider.linkMethod === "openid" && (
                      <button className="btn btn-primary" onClick={() => linkOpenID(provider)}>
                        Sign in with Steam
                      </button>
                    )}

                    {provider.linkMethod === "manual" && (
                      <div className="flex flex-col gap-2">
                        <label className="label text-sm">{provider.manualLabel}</label>
                        <div className="flex gap-2">
                          <input
                            className="input flex-1 font-mono text-sm"
                            placeholder={provider.manualPlaceholder}
                            value={manualInputs[provider.key] ?? ""}
                            onChange={(e) =>
                              setManualInputs((p) => ({ ...p, [provider.key]: e.target.value }))
                            }
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            className={`btn btn-primary ${manualSaving[provider.key] ? "loading" : ""}`}
                            disabled={!(manualInputs[provider.key] ?? "").trim() || manualSaving[provider.key]}
                            onClick={() => linkManual(provider)}
                          >
                            {manualSaving[provider.key] ? "Saving..." : "Link"}
                          </button>
                        </div>
                        {provider.manualHelp && (
                          <p className="text-xs color-muted">
                            {provider.manualHelp}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {errors[provider.key] && (
                  <div className="mt-2 text-sm color-danger">
                    {errors[provider.key]}
                  </div>
                )}

                {/* Dota card for Steam provider */}
                {provider.key === "steam" && connected && (
                  <div className="mt-3">
                    {dotaLoading ? (
                      <div className="text-sm color-muted">
                        Loading Dota 2 profile...
                      </div>
                    ) : dota ? (
                      <DotaCard data={dota} />
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Default tracking preference */}
      <section className="panel mt-6">
        <div className="panel-header">
          <div className="font-semibold">Default Tracking Apps</div>
        </div>
        <div className="panel-body space-y-4">
          <p className="text-sm color-muted">
            Choose your preferred apps for proof submission. These will be pre-selected when you submit evidence for challenges.
          </p>

          <div>
            <label className="label text-sm mb-2 block">Fitness tracker</label>
            <div className="flex flex-wrap gap-2">
              {FITNESS_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`select-card px-3 py-2 text-sm transition-all`}
                  data-selected={fitnessPref === p.id ? "" : undefined}
                  onClick={() => { setFitnessPref(p.id); setDefaultFitnessProvider(p.id); }}
                >
                  <span className="mr-1.5">{p.icon}</span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label text-sm mb-2 block">Gaming platform</label>
            <div className="flex flex-wrap gap-2">
              {GAMING_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`select-card px-3 py-2 text-sm transition-all`}
                  data-selected={gamingPref === p.id ? "" : undefined}
                  onClick={() => { setGamingPref(p.id); setDefaultGamingProvider(p.id); }}
                >
                  <span className="mr-1.5">{p.icon}</span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loading && (
        <div className="mt-4 text-sm text-center color-muted">
          Loading linked accounts...
        </div>
      )}
    </div>
  );
}
