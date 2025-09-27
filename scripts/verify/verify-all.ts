// tasks/verify-all.ts
import { task } from "hardhat/config"
import { readFileSync } from "fs"
import { join } from "path"

task("verify:all", "Verify contracts from webapp/public/deployments/lightchain.json")
  .addOptionalParam("file", "Deployments json", "webapp/public/deployments/lightchain.json")
  .setAction(async (args, hre) => {
    const file = join(process.cwd(), args.file)
    const d = JSON.parse(readFileSync(file, "utf8"))
    const C: Record<string, string> = d.contracts || {}

    const entries: Array<{ name: string, addr: string, args: any[] }> = []

    if (C.Treasury) entries.push({ name: "Treasury", addr: C.Treasury, args: [process.env.ADMIN ?? "", process.env.OPERATOR ?? ""] })
    if (C.ZkProofVerifier) entries.push({ name: "ZkProofVerifier", addr: C.ZkProofVerifier, args: [] })
    if (C.ChallengePay) entries.push({ name: "ChallengePay", addr: C.ChallengePay, args: [C.Treasury] })

    for (const e of entries) {
      try {
        await hre.run("verify:verify", { address: e.addr, constructorArguments: e.args })
        console.log(`✓ verified ${e.name} @ ${e.addr}`)
      } catch (err: any) {
        const msg = err?.message || String(err)
        if (msg.includes("Already Verified")) {
          console.log(`✓ already verified ${e.name}`)
        } else {
          console.log(`(skipped ${e.name}) ${msg}`)
        }
      }
    }
  })