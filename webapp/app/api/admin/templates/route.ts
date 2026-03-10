//webapp/app/api/admin/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filePath = path.join(process.cwd(), "public", "templates.json");

// tiny validator (same shape your UI checks)
function validateTemplates(data: any) {
  if (!Array.isArray(data)) throw new Error("Top-level must be an array");
  for (const t of data) {
    if (typeof t?.id !== "string") throw new Error("Each template needs string id");
    if (typeof t?.modelId !== "string") throw new Error("Each template needs string modelId");
    if (!["steps","running","dota","cs","lol"].includes(t?.kind)) throw new Error("Invalid kind on a template");
    if (!Array.isArray(t?.fields)) throw new Error("Template fields must be an array");
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
    const buf = await fs.readFile(filePath, "utf8").catch(() => "[]");
    const json = JSON.parse(buf);
    validateTemplates(json);
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
    validateTemplates(data);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return NextResponse.json({ ok: true, count: data.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Write failed" }, { status: 400 });
  }
}