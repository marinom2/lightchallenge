/**
 * webapp/app/api/auth/fitbit/callback/route.ts
 *
 * GET /api/auth/fitbit/callback?code=...
 *
 * Fitbit OAuth callback. Exchanges the authorization code for access/refresh
 * tokens using Basic auth (base64 client_id:client_secret), stores them in
 * public.linked_accounts, and binds the Fitbit user ID (encodedId).
 * Redirects to the settings page on completion.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  upsertLinkedAccount,
} from "../../../../../../offchain/db/linkedAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;     // seconds until expiry
  user_id?: string;
  errors?: Array<{ errorType?: string; message?: string }>;
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

function redirect(req: NextRequest, pathQuery: string, provider = "fitbit", stateScheme?: string) {
  // Check cookie first, then state param fallback (native app OAuth has no cookies)
  const scheme = req.cookies.get("redirect_scheme")?.value ?? stateScheme;
  if (scheme && /^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)) {
    const status = pathQuery.includes("=ok") ? "ok" : "error";
    return NextResponse.redirect(`${scheme}://callback?status=${status}&provider=${provider}`, 303);
  }
  const base = req.nextUrl.origin.replace(/\/+$/, "");
  return NextResponse.redirect(`${base}${pathQuery}`, 303);
}

function basicAuthHeader(): string {
  const clientId = process.env.FITBIT_CLIENT_ID ?? "";
  const clientSecret = process.env.FITBIT_CLIENT_SECRET ?? "";
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");
    const stateParams = parseState(req.nextUrl.searchParams.get("state"));

    if (error || !code) {
      return redirect(req, `/settings/linked-accounts?fitbit=${error || "no_code"}`, "fitbit", stateParams.redirect_scheme);
    }

    // Try cookie first, then state param (native app OAuth skips the auth route where cookies are set)
    const subjectRaw = (req.cookies.get("subject")?.value || stateParams.subject || "").trim().toLowerCase();
    if (!isHexAddress(subjectRaw)) {
      return redirect(req, "/settings/linked-accounts?fitbit=missing_wallet", "fitbit", stateParams.redirect_scheme);
    }
    const subject = subjectRaw as `0x${string}`;

    const clientId = process.env.FITBIT_CLIENT_ID;
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("[fitbit:callback] Missing FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET");
      return redirect(req, "/settings/linked-accounts?fitbit=server_config", "fitbit", stateParams.redirect_scheme);
    }

    // Build redirect_uri for the token exchange (must match the one used in the auth request)
    const envBase = (process.env.NEXT_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
    const base = envBase && /^https?:\/\//i.test(envBase)
      ? envBase
      : req.nextUrl.origin.replace(/\/+$/, "");
    const redirectUri = `${base}/api/auth/fitbit/callback`;

    // Exchange code for tokens — Fitbit uses Basic auth + form-encoded body
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(FITBIT_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: body.toString(),
      cache: "no-store",
    });

    const data: TokenResponse = await tokenRes.json();

    if (!data.access_token || !data.refresh_token) {
      const errMsg = data.errors?.[0]?.message ?? String(tokenRes.status);
      console.error("[fitbit:callback] Token exchange failed:", errMsg);
      return redirect(req, "/settings/linked-accounts?fitbit=token_error", "fitbit", stateParams.redirect_scheme);
    }

    // Fitbit returns user_id (encodedId) directly in the token response
    const encodedId = data.user_id ?? undefined;

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    // Store tokens in linked_accounts
    await upsertLinkedAccount({
      subject,
      provider: "fitbit",
      externalId: encodedId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: expiresAt,
    });

    console.log("[fitbit:callback] OK", subject, encodedId ? `user:${encodedId}` : "no-user-id");
    return redirect(req, "/settings/linked-accounts?fitbit=ok", "fitbit", stateParams.redirect_scheme);
  } catch (e) {
    console.error("[fitbit:callback] Error:", e);
    return redirect(req, "/settings/linked-accounts?fitbit=exception", "fitbit");
  }
}
