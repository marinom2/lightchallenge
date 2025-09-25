import { getChallengePay, getSigner } from "../helpers"

async function main() {
  const id = Number(process.env.CH_ID)
  if (!Number.isFinite(id)) throw new Error("Set CH_ID")

  const signer = await getSigner()
  const cp = await getChallengePay()
  const tx = await cp.connect(signer).claimRejectCreator(id)
  console.log("claimRejectCreator tx:", tx.hash)
  await tx.wait()
  console.log("✅ Creator refund claimed")
}

main().catch((e)=>{ console.error(e); process.exit(1) })