// app/api/uploads/session/route.ts
import { NextResponse } from "next/server";
import { issueToken } from "./tokenStore";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET() {
  const token = await issueToken();
  return NextResponse.json({ token, expiresIn: 300 });
}
