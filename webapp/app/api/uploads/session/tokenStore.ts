import crypto from "crypto";

const TOKENS = new Map<string, number>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function makeToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function issueToken(): Promise<string> {
  const token = makeToken();
  TOKENS.set(token, Date.now() + TTL_MS);
  return token;
}

export async function consumeToken(token: string): Promise<{ ok: true } | { ok: false; reason?: string }> {
  const exp = TOKENS.get(token);
  if (!exp) return { ok: false, reason: "invalid" };
  TOKENS.delete(token);
  if (Date.now() > exp) return { ok: false, reason: "expired" };
  return { ok: true };
}
