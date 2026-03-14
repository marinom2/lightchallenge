// webapp/app/api/uploads/route.ts
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { consumeToken as _consumeToken } from "./session/tokenStore";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

// --- Types for the session helper (prevents TS 'never' errors) ---
type SessionConsumeResult = { ok: true } | { ok: false; reason?: string };
const consumeToken = _consumeToken as unknown as (token: string) => Promise<SessionConsumeResult>;

// Keep this aligned with the UI's 25 MB cap.
const MAX_BYTES = 25 * 1024 * 1024;

// Where files land. Served statically by Next from /public.
const DEST_DIR = path.join(process.cwd(), "webapp/public/uploads");

// Basic allow-list; extend as needed
const ALLOWED_EXT = new Set([
  ".zip", // Apple Health export
  ".xml", // Apple Health export (unzipped)
  ".json",
  ".csv",
  ".txt",
]);

function extOf(filename: string) {
  const e = path.extname(filename || "").toLowerCase();
  return e || "";
}

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

type SavedFile = {
  originalName: string;
  size: number;
  sha256: string;
  url: string; // public URL under /uploads
  storedAs: string;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store",
  };
}

// Optional: answer CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() as any });
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { ok: false, error: "Expected multipart/form-data" },
        { status: 400, headers: corsHeaders() as any }
      );
    }

    const form = await req.formData();

    // One-time token from a QR/CTA
    const token = String(form.get("token") || "");
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing token" },
        { status: 401, headers: corsHeaders() as any }
      );
    }

    const tokenRes = await consumeToken(token);
    if (!tokenRes.ok) {
      return NextResponse.json(
        { ok: false, error: tokenRes.reason || "Invalid token" },
        { status: 401, headers: corsHeaders() as any }
      );
    }

    // Collect all file parts (support “file” and multiple fields)
    const fileEntries: File[] = [];
    for (const [, val] of form.entries()) {
      if (val instanceof File) fileEntries.push(val);
    }
    if (fileEntries.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No files found in form data" },
        { status: 400, headers: corsHeaders() as any }
      );
    }

    await ensureDir(DEST_DIR);
    const saved: SavedFile[] = [];

    for (const file of fileEntries) {
      const originalName = file.name || "upload.bin";
      const ext = extOf(originalName);

      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          { ok: false, error: `File type not allowed: ${ext || "unknown"}` },
          { status: 415, headers: corsHeaders() as any }
        );
      }

      const arrayBuf = await file.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const size = buf.byteLength;

      if (size <= 0) {
        return NextResponse.json(
          { ok: false, error: "Empty file" },
          { status: 400, headers: corsHeaders() as any }
        );
      }
      if (size > MAX_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            error: `File too large (${(size / 1024 / 1024).toFixed(2)}MB > ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB)`,
          },
          { status: 413, headers: corsHeaders() as any }
        );
      }

      const hash = sha256(buf);
      const storedAs = `${hash.slice(0, 12)}-${Date.now()}${ext}`;
      const dest = path.join(DEST_DIR, storedAs);
      await fs.writeFile(dest, buf);

      saved.push({
        originalName,
        size,
        sha256: hash,
        storedAs,
      } as SavedFile);
    }

    // Attach public URLs
    const files = saved.map((f) => ({ ...f, url: `/uploads/${f.storedAs}` }));

    return NextResponse.json({ ok: true, files }, { status: 200, headers: corsHeaders() as any });
  } catch (e: any) {
    console.error("[uploads]", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500, headers: corsHeaders() as any }
    );
  }
}