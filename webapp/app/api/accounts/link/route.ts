/**
 * webapp/app/api/accounts/link/route.ts
 *
 * POST /api/accounts/link
 *
 * Links a provider account to a wallet address by storing OAuth tokens
 * (or a plain external ID for non-OAuth providers like opendota).
 *
 * Body:
 *   {
 *     subject:      "0x...",         -- wallet address
 *     provider:     "strava" | "opendota" | "riot" | "apple",
 *     externalId?:  "...",           -- provider user/athlete ID
 *     accessToken?: "...",           -- OAuth access token
 *     refreshToken?:"...",           -- OAuth refresh token
 *     expiresAt?:   1234567890,      -- token expiry (Unix seconds)
 *   }
 *
 * For Strava: call with tokens from the OAuth callback.
 * For OpenDota/Riot: call with just externalId (the Steam64 ID or PUUID).
 *
 * GET /api/accounts/link?subject=0x...
 *   Returns all linked accounts for the wallet (tokens redacted).
 *
 * DELETE /api/accounts/link
 *   Body: { subject, provider }
 *   Unlinks the provider account.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  upsertLinkedAccount,
  getLinkedAccountsForSubject,
  deleteLinkedAccount,
  type LinkedAccountRow,
} from "../../../../../offchain/db/linkedAccounts";
import { verifyWallet, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_PROVIDERS = new Set(["strava", "opendota", "riot", "apple"]);

export async function GET(req: NextRequest) {
  const subject = (req.nextUrl.searchParams.get("subject") ?? "").trim();
  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json({ error: "subject must be a 0x address" }, { status: 400 });
  }

  try {
    const accounts = await getLinkedAccountsForSubject(subject);
    // Redact tokens before returning to client
    const safe = accounts.map(({ access_token: _a, refresh_token: _r, ...rest }: LinkedAccountRow) => rest);
    return NextResponse.json({ ok: true, accounts: safe });
  } catch (e) {
    console.error("[accounts/link GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  const provider = String(body.provider ?? "").trim();

  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json({ error: "subject must be a 0x address" }, { status: 400 });
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { error: `Unsupported provider. Must be one of: ${[...SUPPORTED_PROVIDERS].join(", ")}` },
      { status: 400 }
    );
  }

  // Auth: verify wallet matches the subject linking the account
  const authWallet = await verifyWallet(req);
  const authErr = requireAuth(authWallet, subject);
  if (authErr) return authErr;

  const externalId = body.externalId ? String(body.externalId) : undefined;
  const accessToken = body.accessToken ? String(body.accessToken) : undefined;
  const refreshToken = body.refreshToken ? String(body.refreshToken) : undefined;
  const expiresAtSec = typeof body.expiresAt === "number" ? body.expiresAt : null;

  try {
    const row = await upsertLinkedAccount({
      subject,
      provider,
      externalId,
      accessToken,
      refreshToken,
      tokenExpiresAt: expiresAtSec ? new Date(expiresAtSec * 1000) : undefined,
    });

    return NextResponse.json({ ok: true, id: row.id, provider: row.provider });
  } catch (e) {
    console.error("[accounts/link POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  const provider = String(body.provider ?? "").trim();

  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json({ error: "subject must be a 0x address" }, { status: 400 });
  }
  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  // Auth: verify wallet matches the subject unlinking the account
  const delWallet = await verifyWallet(req);
  const delAuthErr = requireAuth(delWallet, subject);
  if (delAuthErr) return delAuthErr;

  try {
    const deleted = await deleteLinkedAccount(subject, provider);
    return NextResponse.json({ ok: deleted });
  } catch (e) {
    console.error("[accounts/link DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
