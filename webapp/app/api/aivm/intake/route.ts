// app/api/aivm/intake/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isHex, keccak256, toHex } from "viem";

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

    const adapter = adapters.find((a) => a.supports(modelHash));
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

    return NextResponse.json({
      ok: true,
      publicSignals: pubStr,
      dataHash: hash,
      previewCount: Math.min(50, records.length),
      preview: records.slice(0, 50),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Intake failed" }, { status: 500 });
  }
}