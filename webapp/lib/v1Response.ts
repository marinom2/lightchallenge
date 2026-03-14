/**
 * webapp/lib/v1Response.ts
 *
 * Standardized response helpers for v1 API routes.
 *
 * Every response follows a consistent envelope:
 *
 *   Success:  { ok: true, data: T }
 *   Error:    { ok: false, error: "message" }
 *   Paginated: { ok: true, data: T[], total, limit, offset }
 */

import { NextResponse } from "next/server";

/**
 * Return a success response.
 *
 * @param data   - The payload to include under `data`.
 * @param status - HTTP status code (default 200).
 */
export function ok<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * Return an error response.
 *
 * @param message - Human-readable error description.
 * @param status  - HTTP status code (e.g. 400, 401, 404, 500).
 */
export function err(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Return a paginated success response.
 *
 * @param items  - The page of results.
 * @param total  - Total number of matching items across all pages.
 * @param limit  - Page size that was used.
 * @param offset - Zero-based offset into the full result set.
 */
export function paginated<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
): NextResponse {
  return NextResponse.json({
    ok: true,
    data: items,
    total,
    limit,
    offset,
  });
}
