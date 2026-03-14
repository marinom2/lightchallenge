/**
 * webapp/app/api/me/claims/route.ts
 *
 * GET  /api/me/claims?subject=0x...
 *   Returns all persisted claims for a wallet address.
 *
 * POST /api/me/claims
 *   Persists a claim record after a successful on-chain transaction.
 *   Body: { challengeId, subject, claimType, amountWei, txHash, blockNumber? }
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  upsertClaim,
  getClaimsForSubject,
} from "../../../../../offchain/db/claims";
import { verifyWallet, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CLAIM_TYPES = [
  "principal",
  "cashback",
  "validator_reward",
  "validator_reject",
  "reject_creator",
  "reject_contribution",
  "treasury_eth",
];

export async function GET(req: NextRequest) {
  const subject = (req.nextUrl.searchParams.get("subject") ?? "").trim();

  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json(
      { error: "subject must be a 0x address" },
      { status: 400 }
    );
  }

  try {
    const claims = await getClaimsForSubject(subject);
    return NextResponse.json({ ok: true, claims });
  } catch (e) {
    console.error("[me/claims GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { challengeId, subject, claimType, amountWei, txHash, blockNumber } = body;

  if (!challengeId || !subject || !claimType) {
    return NextResponse.json(
      { error: "challengeId, subject, and claimType are required" },
      { status: 400 }
    );
  }

  if (!isAddress(subject as `0x${string}`)) {
    return NextResponse.json(
      { error: "subject must be a 0x address" },
      { status: 400 }
    );
  }

  if (!VALID_CLAIM_TYPES.includes(claimType)) {
    return NextResponse.json(
      { error: `claimType must be one of: ${VALID_CLAIM_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Auth: verify wallet matches the claim subject
  const authWallet = await verifyWallet(req);
  const authErr = requireAuth(authWallet, subject);
  if (authErr) return authErr;

  try {
    const claim = await upsertClaim({
      challengeId,
      subject,
      claimType,
      amountWei: amountWei ?? "0",
      bucketId: challengeId,
      txHash: txHash ?? null,
      blockNumber: blockNumber ?? null,
      source: "ui",
    });

    return NextResponse.json({ ok: true, claim });
  } catch (e) {
    console.error("[me/claims POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
