export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ ok: false, error: "org_id required" }, { status: 400 });

  try {
    const pool = getPool();
    const { rows: [config] } = await pool.query(
      `SELECT * FROM public.whitelabel_configs WHERE org_id = $1`, [orgId]
    );
    return NextResponse.json({ ok: true, config: config || null });
  } catch (e) {
    console.error("[v1/whitelabel GET]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_id, primary_color, logo_url, favicon_url, custom_css, footer_text, custom_domain } = body;
    if (!org_id) return NextResponse.json({ ok: false, error: "org_id required" }, { status: 400 });

    const pool = getPool();
    const { rows: [config] } = await pool.query(
      `INSERT INTO public.whitelabel_configs (org_id, primary_color, logo_url, favicon_url, custom_css, footer_text, custom_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (org_id) DO UPDATE SET
         primary_color = COALESCE($2, whitelabel_configs.primary_color),
         logo_url = COALESCE($3, whitelabel_configs.logo_url),
         favicon_url = COALESCE($4, whitelabel_configs.favicon_url),
         custom_css = COALESCE($5, whitelabel_configs.custom_css),
         footer_text = COALESCE($6, whitelabel_configs.footer_text),
         custom_domain = COALESCE($7, whitelabel_configs.custom_domain),
         updated_at = now()
       RETURNING *`,
      [org_id, primary_color || null, logo_url || null, favicon_url || null, custom_css || null, footer_text || null, custom_domain || null]
    );

    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error("[v1/whitelabel PUT]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
