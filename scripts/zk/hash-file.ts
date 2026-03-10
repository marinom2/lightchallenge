// scripts/zk/hash-file.ts
import fs from "node:fs";
import { keccak256 } from "viem";
import { toHex } from "viem/utils";

const p = process.argv[2];
if (!p) throw new Error("usage: ts-node scripts/zk/hash-file.ts <vk.json>");
const buf = fs.readFileSync(p);
console.log(keccak256(toHex(buf)));