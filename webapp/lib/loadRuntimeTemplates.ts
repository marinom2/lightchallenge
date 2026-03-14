// webapp/lib/loadRuntimeTemplates.ts
import type { TemplatePlain } from "@/lib/templates";

/**
 * Loads admin-defined templates from /api/admin/templates (DB-backed since Phase 12).
 * Returns a plain array of serialisable templates (no paramsBuilder/ruleBuilder).
 * The UI only needs id/kind/name/hint/modelId/fields for discovery and rendering.
 */
export async function loadRuntimeTemplates(): Promise<TemplatePlain[]> {
  try {
    const res = await fetch("/api/admin/templates", { cache: "no-store" });
    if (!res.ok) return [];
    const arr = (await res.json()) as unknown;
    return Array.isArray(arr) ? (arr as TemplatePlain[]) : [];
  } catch {
    return [];
  }
}
