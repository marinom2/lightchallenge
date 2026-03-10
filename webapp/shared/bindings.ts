// webapp/shared/bindings.ts
import path from "path";
import fs from "fs";

export type Binding = {
  subject: `0x${string}`;
  provider: "steam";
  external_id: string;
  handle?: string;
  avatar_url?: string;
};

const DEFAULT_DIR =
  process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), "..", "data");

export const DATA_DIR     = DEFAULT_DIR;
export const BINDINGS_PATH = path.join(DATA_DIR, "bindings.json");
export const NONCE_PATH    = path.join(DATA_DIR, "openid_nonce.json");

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const p of [BINDINGS_PATH, NONCE_PATH]) {
    if (!fs.existsSync(p)) fs.writeFileSync(p, "[]");
  }
}