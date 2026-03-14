export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const competitionId = req.nextUrl.searchParams.get("competition_id");
  if (!competitionId) return NextResponse.json({ ok: false, error: "competition_id required" }, { status: 400 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://uat.lightchallenge.app";
  const embedUrl = `${baseUrl}/embed/${competitionId}`;

  return NextResponse.json({
    ok: true,
    competition_id: competitionId,
    embed_url: embedUrl,
    iframe: `<iframe src="${embedUrl}" width="100%" height="500" frameborder="0" style="border-radius:12px;border:1px solid #1f1f1f"></iframe>`,
    script: `<script src="${baseUrl}/embed.js" data-competition="${competitionId}" data-theme="dark"></script>`,
  });
}
