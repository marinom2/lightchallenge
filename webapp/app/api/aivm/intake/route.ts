// app/api/aivm/intake/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isHex, keccak256, toHex } from "viem";
import { insertEvidence } from "../../../../../offchain/db/evidence";
import { upsertParticipant } from "../../../../../offchain/db/participants";
import { providerFromAdapterName } from "../../../../../offchain/evaluators/index";
import { validateEvidence } from "../../../../../offchain/lib/evidenceValidator";
import { verifyWallet, requireAuth, verifyEvidenceToken } from "@/lib/auth";

export const runtime = "nodejs";     // ensures Buffer & Node modules are available
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ⬇️ Lazy import breaks circular/TDZ issues during build
    const { adapters } = await import("@/lib/aivm/adapters");

    const form = await req.formData();

    const modelHashRaw = String(form.get("modelHash") ?? "");
    if (!isHex(modelHashRaw)) {
      return NextResponse.json({ error: "modelHash must be 0x hex" }, { status: 400 });
    }
    const modelHash = modelHashRaw as `0x${string}`;

    const challengeId = BigInt(String(form.get("challengeId") ?? "0"));

    const subjectRaw = String(form.get("subject") ?? "");
    if (!isHex(subjectRaw)) {
      return NextResponse.json({ error: "subject must be 0x address" }, { status: 400 });
    }
    const subject = subjectRaw as `0x${string}`;

    // Auth: three methods supported (checked in order):
    // 1. Wallet signature headers (browser with connected wallet)
    // 2. Evidence token (iOS app — signed in webapp, passed via deep link)
    // 3. Unauthenticated (fallback — evidence is independently validated by evaluator)
    let authenticated = false;

    // Method 1: wallet signature headers
    const authWallet = await verifyWallet(req);
    if (authWallet) {
      const authErr = requireAuth(authWallet, subject);
      if (authErr) return authErr;
      authenticated = true;
    }

    // Method 2: evidence token (from deep link)
    if (!authenticated) {
      const tokenVal = String(form.get("evidenceToken") ?? "");
      const expiresVal = String(form.get("evidenceExpires") ?? "");
      if (tokenVal && expiresVal) {
        const tokenWallet = await verifyEvidenceToken(
          tokenVal,
          String(challengeId),
          subject,
          expiresVal
        );
        if (tokenWallet) {
          authenticated = true;
        } else {
          return NextResponse.json({ error: "Invalid or expired evidence token" }, { status: 401 });
        }
      }
    }

    // params (optional JSON)
    let params: Record<string, unknown> = {};
    const paramsText = form.get("params");
    if (typeof paramsText === "string" && paramsText.trim().length) {
      try {
        params = JSON.parse(paramsText);
      } catch {
        return NextResponse.json({ error: "params must be valid JSON" }, { status: 400 });
      }
    }

    const file = form.get("file") as File | null;
    const jsonText = form.get("json") as string | null;

    // Provider override: allows selecting a specific adapter by name
    // (e.g. "strava" for a fitness challenge originally created with apple_health modelHash)
    const providerOverride = String(form.get("provider") ?? "").trim();
    const { adapterByName } = await import("@/lib/aivm/adapters");

    let adapter: (typeof adapters)[number] | undefined;
    if (providerOverride) {
      // Try exact name match first, then prefix match
      adapter = adapterByName(providerOverride) ??
        adapters.find((a) => a.name.startsWith(providerOverride + ".")) ??
        adapters.find((a) => a.name.startsWith(providerOverride));
    }
    if (!adapter) {
      adapter = adapters.find((a) => a.supports(modelHash));
    }
    if (!adapter) {
      return NextResponse.json({ error: "No adapter for modelHash" }, { status: 400 });
    }

    const fileBuf = file ? Buffer.from(await file.arrayBuffer()) : undefined;

    let json: unknown | undefined;
    if (typeof jsonText === "string" && jsonText.trim().length) {
      try {
        json = JSON.parse(jsonText);
      } catch {
        return NextResponse.json({ error: "json must be valid JSON" }, { status: 400 });
      }
    }

    // Source-aware file validation — reject structurally invalid uploads early
    // with helpful, source-specific error messages instead of generic adapter errors.
    const provider = providerFromAdapterName(adapter.name);
    if (fileBuf && file) {
      const validation = validateEvidence(provider, fileBuf, file.name);
      if (!validation.valid) {
        return NextResponse.json({
          error: validation.reason,
          provider,
          hint: `Accepted formats: ${validation.detectedFormat ?? "see instructions"}`,
        }, { status: 422 });
      }
      console.log(
        `[intake] ${provider} file validated: format=${validation.detectedFormat} ` +
        `confidence=${validation.confidence} meta=${JSON.stringify(validation.metadata)}`
      );
    }

    const { records = [], publicSignals = [], dataHash } = await adapter.ingest({
      file: fileBuf,
      json,
      context: { challengeId, subject, modelHash, params },
    });

    const pubStr = publicSignals.map((x) => x.toString());

    const hash =
      isHex(dataHash)
        ? (dataHash as `0x${string}`)
        : keccak256(toHex(JSON.stringify({ modelHash, subject, pubStr })));

    // Persist normalized evidence to public.evidence so the evaluator worker
    // can produce a verdict, which the dispatcher then gates on.
    // Failures here are logged but do not prevent returning the response to
    // the client — the caller can retry.
    let evidenceId: string | null = null;
    try {
      const rawRef = file ? file.name : null;
      const row = await insertEvidence({
        challengeId,
        subject,
        provider: providerFromAdapterName(adapter.name),
        data: records,
        evidenceHash: hash,
        rawRef,
      });
      evidenceId = row.id;
    } catch (dbErr: any) {
      console.error("[intake] evidence insert failed:", dbErr?.message ?? dbErr);
    }

    // Upsert a participant record so the subject appears in "My Challenges"
    // even before a verdict is produced.  Non-blocking — failure does not
    // affect the evidence response.  Skipped for challenge_id=0 (UI previews).
    if (challengeId !== 0n) {
      upsertParticipant({ challengeId, subject, source: "evidence_intake" }).catch((err: any) => {
        console.warn("[intake] participant upsert failed:", err?.message ?? err);
      });
    }

    return NextResponse.json({
      ok: true,
      provider,
      publicSignals: pubStr,
      dataHash: hash,
      previewCount: Math.min(50, records.length),
      preview: records.slice(0, 50),
      recordCount: records.length,
      // evidenceId is null when the DB write failed; callers may use it for
      // polling or debugging but must not require it for proof submission.
      evidenceId,
    });
  } catch (e) {
    console.error("[aivm/intake]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
