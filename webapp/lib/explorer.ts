// webapp/lib/explorer.ts
import { lightchain } from "./lightchain";

const EXPLORER =
  lightchain.blockExplorers?.default?.url ||
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer.lightchain.ai";

export function blockUrl(block: string | number | bigint) {
  return `${EXPLORER}/block/${String(block)}`;
}

export function txUrl(tx: `0x${string}` | string) {
  return `${EXPLORER}/tx/${tx}`;
}

export function addressUrl(addr: `0x${string}` | string) {
  return `${EXPLORER}/address/${addr}`;
}