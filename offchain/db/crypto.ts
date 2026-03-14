/**
 * offchain/db/crypto.ts
 *
 * AES-256-GCM encryption/decryption for sensitive fields (e.g. OAuth tokens).
 *
 * Requires a 32-byte hex key in OAUTH_ENCRYPTION_KEY env var (64 hex chars).
 * Throws if the key is not set.
 *
 * Encrypted blobs are prefixed with "enc:" so decrypt() can distinguish
 * encrypted from legacy plaintext values (backward compat).
 *
 * Format: enc:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.OAUTH_ENCRYPTION_KEY;
  if (!key) throw new Error("OAUTH_ENCRYPTION_KEY not set");
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith("enc:")) return ciphertext; // legacy plaintext
  const [, ivHex, tagHex, dataHex] = ciphertext.split(":");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
}
