/**
 * offchain/db/crypto.ts
 *
 * AES-256-GCM encryption/decryption for sensitive fields (e.g. OAuth tokens).
 *
 * Requires a 32-byte hex key in OAUTH_ENCRYPTION_KEY env var (64 hex chars).
 * When the key is not set, encrypt() returns plaintext unchanged and
 * decrypt() returns the stored value unchanged — this allows gradual
 * roll-out without breaking existing unencrypted rows.
 *
 * Encrypted blobs are prefixed with "enc:" so decrypt() can distinguish
 * encrypted from legacy plaintext values.
 *
 * Format: enc:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.OAUTH_ENCRYPTION_KEY;
  if (!hex) return Buffer.alloc(0); // encryption disabled if no key
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (key.length === 0) return plaintext; // no-op if key not set
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(blob: string): string {
  if (!blob || !blob.startsWith("enc:")) return blob; // not encrypted (legacy)
  const key = getKey();
  if (key.length === 0) return blob; // can't decrypt without key
  const parts = blob.split(":");
  if (parts.length !== 4) return blob;
  const [, ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(ctHex, "hex", "utf8") + decipher.final("utf8");
}
