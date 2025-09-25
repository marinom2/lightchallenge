// scripts/lib/env.ts
import { getAddress } from "ethers";

export function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v === "undefined" || v === "null") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export function optEnv(name: string, def?: string): string | undefined {
  const v = process.env[name];
  return v ? v : def;
}

export function envAddress(name: string, def?: string): string {
  const v = process.env[name] ?? def;
  if (!v) throw new Error(`Missing address env: ${name}`);
  return getAddress(v);
}

export function envInt(name: string, def?: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    if (def == null) throw new Error(`Missing int env: ${name}`);
    return def;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Bad int for ${name}: ${raw}`);
  return n;
}

export function envBigInt(name: string, def?: bigint): bigint {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    if (def == null) throw new Error(`Missing bigint env: ${name}`);
    return def;
  }
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`Bad bigint for ${name}: ${raw}`);
  }
}

export function envBool(name: string, def = false): boolean {
  const raw = process.env[name];
  if (raw == null) return def;
  return /^(1|true|yes|on)$/i.test(raw);
}

export function envCsv(name: string, def: string[] = []): string[] {
  const raw = process.env[name];
  if (!raw) return def;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}