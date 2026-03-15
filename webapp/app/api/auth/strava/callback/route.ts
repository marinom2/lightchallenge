/**
 * webapp/app/api/auth/strava/callback/route.ts
 *
 * GET /api/auth/strava/callback?code=...&scope=...
 *
 * Strava OAuth callback. Exchanges the authorization code for access/refresh
 * tokens, stores them in public.linked_accounts, and binds the Strava athlete
 * ID as an identity binding. Redirects to the settings page on completion.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  upsertLinkedAccount,
} from "../../../../../../offchain/db/linkedAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: { id?: number; firstname?: string; lastname?: string };
  errors?: unknown[];
  message?: string;
};

function isHexAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

/**
 * Parse the OAuth state param: "subject:0xABC...,redirect_scheme:lightchallenge"
 */
function parseState(state: string | null): Record<string, string> {
  if (!state) return {};
  const result: Record<string, string> = {};
  for (const pair of state.split(",")) {
    const idx = pair.indexOf(":");
    if (idx > 0) result[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return result;
}

function redirect(req: NextRequest, pathQuery: string, provider = "strava", stateScheme?: string) {
  // Check cookie first, then state param fallback (native app OAuth has no cookies)
  const scheme = req.cookies.get("redirect_scheme")?.value ?? stateScheme;
  if (scheme && /^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)) {
    const status = pathQuery.includes("=ok") ? "ok" : "error";
    return NextResponse.redirect(`${scheme}://callback?status=${status}&provider=${provider}`, 303);
  }
  const base = req.nextUrl.origin.replace(/\/+$/, "");
  return NextResponse.redirect(`${base}${pathQuery}`, 303);
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");
    const stateParams = parseState(req.nextUrl.searchParams.get("state"));

    if (error || !code) {
      return redirect(req, `/settings/linked-accounts?strava=${error || "no_code"}`, "strava", stateParams.redirect_scheme);
    }

    // Try cookie first, then state param (native app OAuth skips the auth route where cookies are set)
    const subjectRaw = (req.cookies.get("subject")?.value || stateParams.subject || "").trim().toLowerCase();
    if (!isHexAddress(subjectRaw)) {
      return redirect(req, "/settings/linked-accounts?strava=missing_wallet", "strava", stateParams.redirect_scheme);
    }
    const subject = subjectRaw as `0x${string}`;

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("[strava:callback] Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
      return redirect(req, "/settings/linked-accounts?strava=server_config", "strava", stateParams.redirect_scheme);
    }

    console.log("[strava:callback] Exchanging code for subject:", subject, "code length:", code.length);
    // Exchange code for tokens
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    const data: TokenResponse = await tokenRes.json();

    if (!data.access_token || !data.refresh_token) {
      console.error("[strava:callback] Token exchange failed:", tokenRes.status, JSON.stringify(data));
      return redirect(req, "/settings/linked-accounts?strava=token_error", "strava", stateParams.redirect_scheme);
    }

    const athleteId = data.athlete?.id ? String(data.athlete.id) : undefined;

    // Store tokens in linked_accounts
    await upsertLinkedAccount({
      subject,
      provider: "strava",
      externalId: athleteId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
    });

    console.log("[strava:callback] OK", subject, athleteId ? `athlete:${athleteId}` : "no-athlete-id");
    return redirect(req, "/settings/linked-accounts?strava=ok", "strava", stateParams.redirect_scheme);
  } catch (e) {
    console.error("[strava:callback] Error:", e);
    return redirect(req, "/settings/linked-accounts?strava=exception", "strava");
  }
}
