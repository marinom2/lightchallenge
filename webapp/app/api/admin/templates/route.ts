/**
 * webapp/app/api/admin/templates/route.ts
 *
 * GET /api/admin/templates
 *   Returns all challenge templates from public.challenge_templates.
 *
 * PUT /api/admin/templates
 *   Body: array of template objects.
 *   Replaces ALL templates in the DB (bulk upsert in transaction).
 *   Requires ADMIN_KEY header in production.
 *
 * Migrated from filesystem (public/templates.json) to DB in Phase 12.
 * The public/templates.json file is now archived and no longer used.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAllTemplates,
  replaceAllTemplates,
  type UpsertTemplateInput,
} from "../../../../../offchain/db/challengeTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS = new Set([
  "steps", "running", "cycling", "hiking", "swimming",
  "dota", "cs", "lol",
]);

function validateTemplates(data: unknown): UpsertTemplateInput[] {
  if (!Array.isArray(data)) throw new Error("Top-level must be an array");

  return data.map((t: any, i: number) => {
    if (typeof t?.id !== "string" || !t.id) {
      throw new Error(`Template[${i}]: id must be a non-empty string`);
    }
    if (typeof t?.name !== "string" || !t.name) {
      throw new Error(`Template[${i}]: name must be a non-empty string`);
    }
    if (typeof t?.modelId !== "string" || !t.modelId) {
      throw new Error(`Template[${i}]: modelId must be a non-empty string`);
    }
    if (!VALID_KINDS.has(t?.kind)) {
      throw new Error(
        `Template[${i}]: invalid kind '${t?.kind}'. Must be one of: ${[...VALID_KINDS].join(", ")}`
      );
    }
    if (!Array.isArray(t?.fields)) {
      throw new Error(`Template[${i}]: fields must be an array`);
    }

    return {
      id: t.id,
      name: t.name,
      hint: t.hint ?? null,
      kind: t.kind,
      modelId: t.modelId,
      fieldsJson: t.fields,
      ruleConfig: t.ruleConfig ?? null,
      active: t.active !== false,
    };
  });
}

function checkAuth(req: NextRequest): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const got = req.headers.get("x-admin-key") ?? "";
  return got === key;
}

function rowToJson(row: Awaited<ReturnType<typeof getAllTemplates>>[number]) {
  return {
    id:         row.id,
    name:       row.name,
    hint:       row.hint,
    kind:       row.kind,
    modelId:    row.model_id,
    fields:     row.fields_json,
    ruleConfig: row.rule_config,
    active:     row.active,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rows = await getAllTemplates();
    return NextResponse.json(rows.map(rowToJson));
  } catch (e) {
    console.error("[admin/templates GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let inputs: UpsertTemplateInput[];
  try {
    inputs = validateTemplates(data);
  } catch (e) {
    console.error("[admin/templates PUT validation]", e);
    return NextResponse.json({ error: "Invalid template data" }, { status: 400 });
  }

  try {
    const rows = await replaceAllTemplates(inputs);
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    console.error("[admin/templates PUT]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
