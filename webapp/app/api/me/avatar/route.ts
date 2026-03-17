/**
 * GET  /api/me/avatar?address=0x...  — Serve avatar image (binary)
 * POST /api/me/avatar                — Upload avatar (multipart/form-data)
 * DELETE /api/me/avatar              — Remove avatar (JSON body with wallet)
 *
 * POST body: FormData with fields:
 *   - wallet: "0x..." (text field)
 *   - avatar: File (image/jpeg or image/png, max 2MB)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getUserAvatar,
  updateUserAvatar,
  deleteUserAvatar,
} from "../../../../../offchain/db/userProfiles";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "address query param required" },
      { status: 400 }
    );
  }

  const avatar = await getUserAvatar(address);
  if (!avatar) {
    return new NextResponse(null, { status: 404 });
  }

  // ETag caching
  const etag = `"${avatar.hash}"`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 });
  }

  return new NextResponse(new Uint8Array(avatar.data), {
    status: 200,
    headers: {
      "Content-Type": avatar.mime,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      ETag: etag,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const wallet = formData.get("wallet") as string | null;
    const file = formData.get("avatar") as File | null;

    if (!wallet || typeof wallet !== "string" || !wallet.startsWith("0x")) {
      return NextResponse.json(
        { error: "valid wallet address required" },
        { status: 400 }
      );
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "avatar file required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `unsupported image type: ${file.type}. Use JPEG, PNG, or WebP.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json(
        { error: "avatar must be under 2MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await updateUserAvatar(wallet, buffer, file.type);

    return NextResponse.json({ ok: true, message: "avatar updated" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet } = body;

    if (!wallet || typeof wallet !== "string" || !wallet.startsWith("0x")) {
      return NextResponse.json(
        { error: "valid wallet address required" },
        { status: 400 }
      );
    }

    await deleteUserAvatar(wallet);
    return NextResponse.json({ ok: true, message: "avatar removed" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "internal error" },
      { status: 500 }
    );
  }
}
