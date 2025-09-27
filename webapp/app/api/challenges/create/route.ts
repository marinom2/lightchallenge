// app/api/challenges/create/route.ts
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import type { ChallengeMeta } from "@/lib/types/challenge"

export const runtime = "nodejs"          // required for fs
export const dynamic = "force-dynamic"
export const revalidate = 0

const dbFile = path.join(process.cwd(), "webapp/public/challenges.json")

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ChallengeMeta>

    if (!body?.title || !body?.params) {
      return NextResponse.json(
        { error: "Missing required fields: title, params" },
        { status: 400 }
      )
    }

    // Always assign a non-null id
    const id = body.id && body.id.trim() !== "" 
      ? body.id 
      : `pending-${Date.now()}`

    const next: ChallengeMeta = {
      id,
      title: body.title,
      description: body.description ?? "",
      params: body.params,
      category: body.category ?? "custom",
      verifier: body.verifier ?? "",
      txHash: body.txHash,
    }

    const raw = await fs.readFile(dbFile, "utf-8").catch(() => "[]")
    const all: ChallengeMeta[] = JSON.parse(raw)

    // Replace or add
    const without = all.filter((c) => c.id !== id)
    const updated = [...without, next]

    await fs.writeFile(dbFile, JSON.stringify(updated, null, 2))

    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    )
  }
}