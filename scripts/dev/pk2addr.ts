import "dotenv/config";
import { Wallet } from "ethers";

const pk = process.env.PK || process.env.PK0 || process.env.PK1 || "";
if (!pk) throw new Error("Set PK / PK0 / PK1 (dotenv supported)");
console.log(new Wallet(pk).address);