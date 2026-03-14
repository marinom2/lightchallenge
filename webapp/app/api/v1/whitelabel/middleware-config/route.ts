/**
 * webapp/app/api/v1/whitelabel/middleware-config/route.ts
 *
 * Returns the white-label configuration for the requesting domain.
 *
 * GET — Looks up whitelabel_configs by the Host header's custom_domain.
 *       If no match, returns { ok: true, data: null } (use defaults).
 *
 * This route is intentionally unauthenticated so the frontend can
 * call it on every page load before the user logs in.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/whitelabel/middleware-config                            */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Extract the host from the request.
    // In production this is the custom domain; locally it's localhost:3000.
    const host = req.headers.get("host") ?? "";

    // Strip port if present (e.g. "example.com:3000" -> "example.com")
    const domain = host.split(":")[0].toLowerCase().trim();

    if (!domain) {
      return NextResponse.json({ ok: true, data: null });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT primary_color,
              logo_url,
              favicon_url,
              custom_css,
              footer_text
         FROM whitelabel_configs
        WHERE lower(custom_domain) = $1
        LIMIT 1`,
      [domain],
    );

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, data: null });
    }

    const config = rows[0];

    return NextResponse.json({
      ok: true,
      data: {
        primary_color: config.primary_color ?? null,
        logo_url: config.logo_url ?? null,
        favicon_url: config.favicon_url ?? null,
        custom_css: config.custom_css ?? null,
        footer_text: config.footer_text ?? null,
      },
    });
  } catch (err) {
    console.error("[v1/whitelabel/middleware-config GET]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
