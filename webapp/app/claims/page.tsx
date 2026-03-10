// app/claims/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";
import Link from "next/link";
import { ADDR } from "@/lib/contracts";
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer";
import ChallengeFinalize from "@/app/components/ChallengeFinalize";
import ChallengeClaims from "@/app/components/ChallengeClaims";
import ProofPanel from "@/app/components/ProofPanel";

type Status = "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";

type ApiOut = {
  id: string;
  status: Status;
  creator?: `0x${string}`;
  startTs?: string;
  createdBlock?: string;
  createdTx?: `0x${string}`;
  winnersClaimed?: number;
  proofRequired?: boolean;
  proofOk?: boolean;
  title?: string;
  description?: string;
  params?: string;
  category?: string;
  verifier?: `0x${string}`;
  kindKey?: "steps" | "running" | "dota" | "cs" | "lol";
  form?: Record<string, string | number>;
  timeline: {
    name: string;
    label: string;
    tx: `0x${string}`;
    block: string;
    timestamp?: number;
  }[];
};

export default function ClaimsPage() {
  const chainId = useChainId();
  const [idInput, setIdInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiOut | null>(null);

  // Load from ?id= if present
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qs = sp.get("id");
    if (qs && /^\d+$/.test(qs)) {
      setIdInput(qs);
      void load(qs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(idStr: string) {
    setErr(null);
    setLoading(true);
    try {
      const trimmed = String(idStr || "").trim();
      if (!/^\d+$/.test(trimmed)) throw new Error("Enter a numeric challenge ID");
      const res = await fetch(`/api/challenge/${trimmed}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `API error ${res.status}`);
      setData(j as ApiOut);

      // reflect in URL
      const url = new URL(window.location.href);
      url.searchParams.set("id", trimmed);
      window.history.replaceState({}, "", url.toString());
    } catch (e: any) {
      setData(null);
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const canFinalize = useMemo(() => {
    if (!data) return false;
    return data.status === "Approved" || data.status === "Paused";
  }, [data]);

  const canClaim = useMemo(() => data?.status === "Finalized", [data]);

  // Proof panel auto-config
  const verifier = data?.verifier as `0x${string}` | undefined;
  const proofRequired = !!data?.proofRequired;
  const requireZk = false;
  const requireAivm =
    proofRequired &&
    !!ADDR.ChallengePayAivmPoiVerifier &&
    equalAddr(verifier, ADDR.ChallengePayAivmPoiVerifier);

  const headerSubtitle = useMemo(() => {
    if (!data) return `ChainId: ${chainId ?? "…"}`;
    const bits: string[] = [];
    bits.push(`ChainId: ${chainId ?? "…"}`);
    bits.push(`Challenge #${data.id}`);
    if (data.category) bits.push(data.category);
    return bits.join(" • ");
  }, [chainId, data]);

  const showActions = !!data && (canFinalize || canClaim || (proofRequired && verifier));

  return (
    <div className="container-narrow mx-auto px-4 py-8 space-y-6">
      {/* Page hero */}
      <div className="section overflow-hidden">
        <div className="page-hero" aria-hidden="true" />
        <div className="section-lens" aria-hidden="true" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs tracking-wide text-[color:var(--text-muted)]">
              LightChallenge
            </div>
            <h1 className="h1 mt-1">
              Finalize <span className="text-[color:var(--text-muted)]">/</span> Claim
            </h1>
            <div className="mt-2 text-sm text-[color:var(--text-muted)]">
              {headerSubtitle}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {data?.id ? (
              <>
                <Link href={`/challenge/${data.id}`} className="btn btn-ghost btn-sm">
                  View challenge
                </Link>
                <a
                  className="btn btn-outline btn-sm"
                  href={`/claims?id=${data.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    void load(String(data.id));
                  }}
                >
                  Refresh
                </a>
              </>
            ) : (
              <span className="chip chip--soft">Paste an ID to load</span>
            )}
          </div>
        </div>
      </div>

      {/* Search / Load */}
      <div className="panel">
        <div className="panel-body">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 flex flex-col sm:flex-row gap-3 sm:items-center">
              <input
                className="input sm:max-w-[260px]"
                placeholder="Challenge ID (e.g. 42)"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load(idInput);
                }}
                inputMode="numeric"
              />

              <button
                className={`btn btn-primary ${loading ? "loading" : ""}`}
                onClick={() => void load(idInput)}
                disabled={loading}
                aria-busy={loading ? "true" : "false"}
              >
                {loading ? "Loading…" : "Load"}
              </button>

              <div className="hidden sm:block flex-1" />

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setIdInput("");
                    setErr(null);
                    setData(null);
                    const url = new URL(window.location.href);
                    url.searchParams.delete("id");
                    window.history.replaceState({}, "", url.toString());
                  }}
                  disabled={loading}
                >
                  Clear
                </button>

                <button
                  className="btn btn-outline btn-sm"
                  onClick={async () => {
                    if (!navigator.clipboard) return;
                    try {
                      const t = (await navigator.clipboard.readText()).trim();
                      if (/^\d+$/.test(t)) {
                        setIdInput(t);
                        void load(t);
                      } else {
                        setErr("Clipboard does not contain a numeric ID");
                      }
                    } catch {
                      setErr("Clipboard read failed (browser permissions)");
                    }
                  }}
                  disabled={loading}
                >
                  Paste ID
                </button>
              </div>
            </div>
          </div>

          {err && (
            <div className="mt-3">
              <div className="chip chip--bad">Error: {err}</div>
            </div>
          )}

          {!data && !err && (
            <div className="mt-3 text-sm text-[color:var(--text-muted)]">
              Tip: You can share a direct link like{" "}
              <code className="mono">/claims?id=42</code>.
            </div>
          )}
        </div>
      </div>

      {/* Loaded content */}
      {(data || loading) && (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
          {/* Summary */}
          <div className="dark-card lg:col-span-2">
            <div className="dark-sheen" aria-hidden />
            <div className="dark-halo" aria-hidden />
            <div className="space-y-3 relative">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-[color:var(--text-muted)]">
                    {loading ? "Loading challenge…" : `Challenge #${data?.id ?? "—"}`}
                    {data?.title ? ` • ${data.title}` : ""}
                  </div>
                  {data?.description ? (
                    <p className="mt-2 text-sm text-[color:var(--text-muted)] max-w-[78ch]">
                      {data.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                      {loading ? "Fetching metadata, status, and timeline…" : "No description provided."}
                    </p>
                  )}
                </div>

                {data?.id ? (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <span className={`chip ${chipClassForStatus(data.status)}`}>{data.status}</span>

                    {data.proofRequired && (
                      <span className={`chip ${data.proofOk ? "chip--ok" : "chip--info"}`}>
                        {data.proofOk ? "Proof OK" : "Proof required"}
                      </span>
                    )}

                    {typeof data.winnersClaimed === "number" && (
                      <span className="chip">Winners claimed: {data.winnersClaimed}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <span className="chip chip--soft">…</span>
                  </div>
                )}
              </div>

              {/* Key facts grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <Row label="Creator">
                  {data?.creator ? (
                    <a className="link" target="_blank" rel="noreferrer" href={addressUrl(data.creator)}>
                      {short(data.creator)}
                    </a>
                  ) : (
                    "—"
                  )}
                </Row>

                <Row label="Verifier">
                  {verifier ? (
                    <code className="mono break-all">{verifier}</code>
                  ) : (
                    "—"
                  )}
                </Row>

                <Row label="Created block">
                  {data?.createdBlock ? (
                    <a className="link" target="_blank" rel="noreferrer" href={blockUrl(data.createdBlock)}>
                      #{data.createdBlock}
                    </a>
                  ) : (
                    "—"
                  )}
                </Row>

                <Row label="Created tx">
                  {data?.createdTx ? (
                    <a className="link" target="_blank" rel="noreferrer" href={txUrl(data.createdTx)}>
                      {data.createdTx.slice(0, 12)}…
                    </a>
                  ) : (
                    "—"
                  )}
                </Row>
              </div>

              {/* Micro guidance */}
              {data?.id && (
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {canFinalize && "Finalize is available for Approved/Paused challenges."}
                  {canClaim && "Claims are available after Finalized."}
                  {!canFinalize && !canClaim && data.status !== "Finalized" && (
                    <>Actions depend on status. Check timeline for the latest event.</>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions column */}
          <div className="space-y-3">
            {showActions ? (
              <div className="lg:sticky lg:top-[calc(var(--navbar-top)+18px)] space-y-3">
                {(canFinalize || canClaim) && data && (
                  <div className="card p-3">
                    <div className="text-sm font-semibold mb-2">Actions</div>
                    <div className="space-y-3">
                      {canFinalize && <ChallengeFinalize id={BigInt(data.id)} status={data.status} />}
                      {canClaim && <ChallengeClaims id={BigInt(data.id)} status={data.status} />}
                    </div>
                  </div>
                )}

                {proofRequired && verifier && data && (
                  <ProofPanel
                    id={BigInt(data.id)}
                    verifier={verifier}
                    requireZk={requireZk}
                    requireAivm={requireAivm}
                    {...(data.kindKey && data.form ? { kindKey: data.kindKey as any, form: data.form as any } : {})}
                  />
                )}
              </div>
            ) : (
              <div className="card p-3">
                <div className="text-sm font-semibold mb-1">Actions</div>
                <div className="text-sm text-[color:var(--text-muted)]">
                  Load a challenge to see finalize / claim / proof options.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      {data && (
        <div className="panel">
          <div className="panel-header">
            <div className="font-semibold text-lg">Timeline</div>
            <div className="text-xs text-[color:var(--text-muted)]">
              {data.timeline.length} event{data.timeline.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="panel-body">
            {data.timeline.length === 0 ? (
              <div className="subpanel">
                <div className="subpanel__head">
                  <div className="subpanel__title">
                    <span className="subpanel__icon" aria-hidden="true">
                      ⎯
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold">No events yet</div>
                      <div className="text-sm text-[color:var(--text-muted)]">
                        This challenge has no recorded timeline entries.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="subpanel__body text-sm text-[color:var(--text-muted)]">
                  Once a transaction happens (create/approve/finalize/claim), it will appear here with block + tx links.
                </div>
              </div>
            ) : (
              <div className="timeline">
                <div className="timeline__spine" aria-hidden="true" />

                {data.timeline.map((t) => {
                  const when = t.timestamp ? timeAgo(t.timestamp * 1000) : null;

                  return (
                    <div key={`${t.tx}-${t.block}`} className="timeline__row">
                      <div className="timeline__node" aria-hidden="true" />

                      <div className="timeline__card">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="badge">{t.name}</span>
                              <span className="font-semibold">{t.label}</span>
                              {when && (
                                <span className="chip chip--soft text-xs">
                                  {when}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="timeline__meta text-sm flex flex-wrap items-center gap-2">
                            <a className="link" target="_blank" rel="noreferrer" href={blockUrl(t.block)}>
                              #{t.block}
                            </a>
                            <span>•</span>
                            <a className="link" target="_blank" rel="noreferrer" href={txUrl(t.tx)}>
                              {t.tx.slice(0, 12)}…
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── tiny presentational helpers ─────────────────────────────────────────── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="w-36 text-[color:var(--text-muted)]">{label}</div>
      <div className="flex-1 break-words">{children}</div>
    </div>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function equalAddr(a?: string, b?: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function timeAgo(ms: number) {
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function chipClassForStatus(s: Status) {
  switch (s) {
    case "Approved":
      return "chip--ok";
    case "Rejected":
      return "chip--bad";
    case "Finalized":
      return "chip--info";
    case "Canceled":
      return "chip--warn";
    case "Paused":
      return "";
    default:
      return "";
  }
}