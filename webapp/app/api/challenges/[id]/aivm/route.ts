import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(_: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;

  try {
    const mod = await import(
      "../../../../../../offchain/runners/runChallengePayAivmJob"
    );

    await mod.runChallengePayAivmJob(id);

    return NextResponse.json({
      ok: true,
      message: "AIVM pipeline executed",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AIVM pipeline failed" },
      { status: 500 }
    );
  }
}