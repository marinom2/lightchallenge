import { NextRequest, NextResponse } from "next/server";
import { bindIdentity, checkAndConsumeNonce } from "../../../../../../offchain/identity/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENID_URL          = "https://steamcommunity.com/openid/login";
const STEAM_API_SUMMARIES = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

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
    if (!valid) return redirect(req, "/proofs?steam=error_openid_validate");

    const nonce   = (req.nextUrl.searchParams.get("openid.response_nonce") || "").trim();
    const claimed = (req.nextUrl.searchParams.get("openid.claimed_id") || "").trim();
    const steam64 = extractSteamID64(claimed);
    const subjectCookie = (req.cookies.get("subject")?.value || "").trim().toLowerCase();
    const subject = subjectCookie as `0x${string}`;

    if (!steam64 || !isHexAddress(subject)) {
      return redirect(req, "/proofs?steam=missing_params");
    }

    // 2) Replay protection via DB nonce store (24 h TTL)
    if (nonce) {
      const fresh = await checkAndConsumeNonce(nonce);
      if (!fresh) return redirect(req, "/proofs?steam=replay_detected");
    }

    // 3) Persona enrichment
    let handle: string | undefined;
    try {
      const prof = await fetchSteamPersona(steam64);
      handle = prof.handle;
    } catch {}

    // 4) Upsert binding in DB-backed registry
    const signerPk = process.env.AIVM_SIGNER_KEY as string | undefined;
    if (!signerPk) {
      console.error("[steam:return] Missing AIVM_SIGNER_KEY");
      return redirect(req, "/proofs?steam=server_config");
    }
    await bindIdentity(signerPk, subject, "steam", steam64, handle);

    console.log("[steam:return] OK", subject, steam64);
    return redirect(req, "/proofs?steam=ok");
  } catch (e) {
    console.error("Steam return error:", e);
    return redirect(req, "/proofs?steam=exception");
  }
}
