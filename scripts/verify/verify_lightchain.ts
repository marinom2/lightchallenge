import { run } from "hardhat"
import { readFileSync } from "fs"
import { join } from "path"

async function main() {
  const deployFile = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json")
  const { contracts } = JSON.parse(readFileSync(deployFile, "utf8"))
  const addr = contracts?.ChallengePay
  if (!addr) throw new Error("No ChallengePay in deployments file")

  // If Lightscan supports API verification, this will work once the API is live/configured.
  try {
    await run("verify:verify", {
      address: addr,
      constructorArguments: [],
    })
    console.log("Verify request submitted for", addr)
  } catch (e) {
    console.warn("Verify failed/skipped:", (e as any)?.message ?? e)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})