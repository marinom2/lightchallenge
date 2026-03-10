// webapp/lib/loadRuntimeTemplates.ts
import type { TemplatePlain } from "@/lib/templates";

/**
 * Loads admin-defined templates from /public/templates.json (top-level array).
 * These are "plain" (no paramsBuilder). The UI only needs id/kind/name/hint/modelId/fields.
 */
export async function loadRuntimeTemplates(): Promise<TemplatePlain[]> {
  try {
    const res = await fetch("/templates.json", { cache: "no-store" });
    if (!res.ok) return [];
    const arr = (await res.json()) as unknown;
    return Array.isArray(arr) ? (arr as TemplatePlain[]) : [];
  } catch {
    return [];
  }
}