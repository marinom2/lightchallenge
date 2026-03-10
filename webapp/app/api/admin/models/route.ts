// weabpp/app/api/admin/models/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filePath = path.join(process.cwd(), "public", "models", "models.json");

function validateModels(data: any) {
  if (!data || !Array.isArray(data.models)) throw new Error("Top-level must be { models: [] }");
  for (const m of data.models) {
    if (typeof m?.id !== "string") throw new Error("Each model needs string id");
    if (!["aivm","zk","plonk"].includes(m?.kind)) {throw new Error('Model kind must be "aivm", "zk", or "plonk"');}
    if (typeof m?.modelHash !== "string" || !m.modelHash.startsWith("0x")) throw new Error("modelHash must be 0x hex");
    if (typeof m?.verifier !== "string" || !m.verifier.startsWith("0x")) throw new Error("verifier must be 0x address");
  }
}

function isDev() { return process.env.NODE_ENV !== "production"; }
function checkAuth(req: NextRequest) {
  const key = process.env.ADMIN_KEY;
  if (!key || isDev()) return true;
  const got = req.headers.get("x-admin-key") || "";
  return got === key;
}

export async function GET() {
  try {
    const buf = await fs.readFile(filePath, "utf8").catch(() => '{"models":[]}' );
    const json = JSON.parse(buf);
    validateModels(json);
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Read failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.text();
    const data = JSON.parse(body);
    validateModels(data);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return NextResponse.json({ ok: true, count: data.models.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Write failed" }, { status: 400 });
  }
}