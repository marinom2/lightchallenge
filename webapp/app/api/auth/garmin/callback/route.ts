/**
 * webapp/app/api/auth/garmin/callback/route.ts
 *
 * GET /api/auth/garmin/callback?code=...
 *
 * Garmin OAuth callback. Exchanges the authorization code for access/refresh
 * tokens, stores them in public.linked_accounts, and binds the Garmin user ID.
 * Redirects to the settings page (or iOS app via redirect_scheme) on completion.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  upsertLinkedAccount,
} from "../../../../../../offchain/db/linkedAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GARMIN_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/token";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: string;
  error?: string;
  error_description?: string;
};

function isHexAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

/**
 * Parse the OAuth state param: "subject:0xABC...,redirect_scheme:lightchallengeapp"
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

function redirect(req: NextRequest, pathQuery: string, provider = "garmin", stateScheme?: string) {
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
      return redirect(req, `/settings/linked-accounts?garmin=${error || "no_code"}`, "garmin", stateParams.redirect_scheme);
    }

    // Try cookie first, then state param (native app OAuth skips the auth route where cookies are set)
    const subjectRaw = (req.cookies.get("subject")?.value || stateParams.subject || "").trim().toLowerCase();
    if (!isHexAddress(subjectRaw)) {
      return redirect(req, "/settings/linked-accounts?garmin=missing_wallet", "garmin", stateParams.redirect_scheme);
    }
    const subject = subjectRaw as `0x${string}`;

    const clientId = process.env.GARMIN_CLIENT_ID;
    const clientSecret = process.env.GARMIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("[garmin:callback] Missing GARMIN_CLIENT_ID or GARMIN_CLIENT_SECRET");
      return redirect(req, "/settings/linked-accounts?garmin=server_config", "garmin", stateParams.redirect_scheme);
    }

    // Build redirect_uri (must match the one used in the auth request)
    const envBase = (process.env.NEXT_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
    const base = envBase && /^https?:\/\//i.test(envBase)
      ? envBase
      : req.nextUrl.origin.replace(/\/+$/, "");
    const redirectUri = `${base}/api/auth/garmin/callback`;

    // Exchange code for tokens — Garmin uses form-encoded body
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(GARMIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    const data: TokenResponse = await tokenRes.json();

    if (!data.access_token) {
      const errMsg = data.error_description ?? data.error ?? String(tokenRes.status);
      console.error("[garmin:callback] Token exchange failed:", errMsg);
      return redirect(req, "/settings/linked-accounts?garmin=token_error", "garmin", stateParams.redirect_scheme);
    }

    const userId = data.user_id ?? undefined;

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    await upsertLinkedAccount({
      subject,
      provider: "garmin",
      externalId: userId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      tokenExpiresAt: expiresAt,
    });

    console.log("[garmin:callback] OK", subject, userId ? `user:${userId}` : "no-user-id");
    return redirect(req, "/settings/linked-accounts?garmin=ok", "garmin", stateParams.redirect_scheme);
  } catch (e) {
    console.error("[garmin:callback] Error:", e);
    return redirect(req, "/settings/linked-accounts?garmin=exception", "garmin");
  }
}
