import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { ensureDataDir, NONCE_PATH } from "../../../../../shared/bindings"; 
import { bindIdentity } from "../../../../../../offchain/identity/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_API_SUMMARIES = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

type NonceRow = { n: string; t: number };

async function loadJson<T>(p: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; }
}
async function saveJson(p: string, v: any) {
  await ensureDataDir();
  await fs.writeFile(p, JSON.stringify(v, null, 2));
}
function isHexAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}
function extractSteamID64(claimed_id: string) {
  const m = claimed_id.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/);
  return m ? m[1] : "";
}
async function verifyOpenID(fullQuery: string) {
  const params = new URLSearchParams(fullQuery);
  params.set("openid.mode", "check_authentication");
  const r = await fetch(OPENID_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const body = await r.text();
  return body.includes("is_valid:true");
}
async function fetchSteamPersona(steam64: string): Promise<{ handle?: string }> {
  const key = process.env.STEAM_WEBAPI_KEY;
  if (!key) return {};
  const url = `${STEAM_API_SUMMARIES}?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(steam64)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return {};
  const j: any = await r.json().catch(() => ({}));
  const p = j?.response?.players?.[0];
  if (!p) return {};
  return { handle: p.personaname || undefined };
}

function redirect(req: NextRequest, pathQuery: string) {
  const base = req.nextUrl.origin.replace(/\/+$/, "");
  return NextResponse.redirect(`${base}${pathQuery}`, 303);
}

export async function GET(req: NextRequest) {
  try {
    // 1) Validate OpenID response with Steam
    const valid = await verifyOpenID(req.nextUrl.searchParams.toString());
    if (!valid) return redirect(req, "/validators?steam=error_openid_validate");

    const nonce = (req.nextUrl.searchParams.get("openid.response_nonce") || "").trim();
    const claimed = (req.nextUrl.searchParams.get("openid.claimed_id") || "").trim();
    const steam64 = extractSteamID64(claimed);
    const subjectCookie = (req.cookies.get("subject")?.value || "").trim().toLowerCase();
    const subject = subjectCookie as `0x${string}`;

    if (!steam64 || !isHexAddress(subject)) {
      return redirect(req, "/validators?steam=missing_params");
    }

    // 2) Replay protection (24h TTL)
    const TTL_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const store = await loadJson<NonceRow[]>(NONCE_PATH, []);
    const fresh = store.filter(row => now - (row?.t || 0) < TTL_MS);
    if (nonce && fresh.some(row => row.n === nonce)) {
      return redirect(req, "/validators?steam=replay_detected");
    }
    if (nonce) fresh.push({ n: nonce, t: now });
    await saveJson(NONCE_PATH, fresh);

    // 3) Persona enrichment (handle only)
    let handle: string | undefined;
    try {
      const prof = await fetchSteamPersona(steam64);
      handle = prof.handle;
    } catch {}

    // 4) Upsert binding in the consolidated registry
    const signerPk = process.env.AIVM_SIGNER_KEY as string | undefined;
    if (!signerPk) {
      console.error("[steam:return] Missing AIVM_SIGNER_KEY");
      return redirect(req, "/validators?steam=server_config");
    }
    await bindIdentity(signerPk, subject, "steam", steam64, handle);

    console.log("[steam:return] OK", subject, steam64);
    return redirect(req, "/validators?steam=ok");
  } catch (e) {
    console.error("Steam return error:", e);
    return redirect(req, "/validators?steam=exception");
  }
}