// webapp/app/api/admin/models/route.ts
//
// GET  /api/admin/models  — returns { models: ModelRow[] } from public.models DB table
// PUT  /api/admin/models  — replaces the entire catalog (atomic transaction)
//
// Source of truth is now public.models (migration 007_models.sql).
// webapp/public/models/models.json is a legacy archive — no longer read or written.

import { NextRequest, NextResponse } from "next/server";
import { getAllModels, getAllModelsAdmin, replaceAllModels, type ModelRow } from "../../../../../offchain/db/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest) {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const got = req.headers.get("x-admin-key") || "";
  return got === key;
}

function validateModels(models: unknown[]): void {
  for (const m of models) {
    const row = m as Record<string, unknown>;
    if (typeof row?.id !== "string") throw new Error("Each model needs string id");
    if (!["aivm", "custom"].includes(row?.kind as string)) {
      throw new Error('Model kind must be "aivm" or "custom"');
    }
    if (typeof row?.modelHash !== "string" || !(row.modelHash as string).startsWith("0x")) {
      throw new Error("modelHash must be 0x hex");
    }
    if (typeof row?.verifier !== "string" || !(row.verifier as string).startsWith("0x")) {
      throw new Error("verifier must be 0x address");
    }
  }
}

export async function GET(req: NextRequest) {
  // GET is public — models are non-sensitive metadata needed by the create-challenge UI.
  // PUT (mutation) still requires admin auth.
  try {
    const isAdmin = checkAuth(req);
    const rows = isAdmin ? await getAllModelsAdmin() : await getAllModels();
    // Return same { models: [...] } shape as before for backward compat with modelRegistry.ts / admin UI
    const models = rows.map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      modelHash: r.modelHash,
      verifier: r.verifier,
      ...(r.plonkVerifier ? { plonkVerifier: r.plonkVerifier } : {}),
      binding: r.binding,
      signals: r.signals,
      params: r.params,
      sources: r.sources,
      fileAccept: r.fileAccept,
      ...(r.notes ? { notes: r.notes } : {}),
    }));
    return NextResponse.json({ models });
  } catch (e) {
    console.error("[admin/models GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.text();
    const data = JSON.parse(body);
    if (!data || !Array.isArray(data.models)) {
      throw new Error("Top-level must be { models: [] }");
    }

    // Safety: refuse to save an empty model list (would break challenge creation)
    if (data.models.length === 0) {
      return NextResponse.json(
        { error: "Refusing to save empty model list — this would break challenge creation. At least 1 model is required." },
        { status: 400 }
      );
    }

    // Safety: check for significant model count drop (potential accidental data loss)
    const existingCount = (await getAllModelsAdmin()).length;
    if (existingCount > 0 && data.models.length < existingCount / 2) {
      // Allow if explicitly confirmed via header
      const forceConfirm = req.headers.get("x-confirm-model-reduction");
      if (forceConfirm !== "true") {
        return NextResponse.json(
          {
            error: `Model count would drop from ${existingCount} to ${data.models.length}. ` +
              `If intentional, resend with header x-confirm-model-reduction: true.`,
            existingCount,
            newCount: data.models.length,
          },
          { status: 409 }
        );
      }
    }

    validateModels(data.models);
    await replaceAllModels(data.models as ModelRow[]);
    return NextResponse.json({ ok: true, count: data.models.length });
  } catch (e) {
    console.error("[admin/models PUT]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
