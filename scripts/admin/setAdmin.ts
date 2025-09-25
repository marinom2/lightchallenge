import { confirmDangerousAction, context, fail, header, info, requireHexAddress } from "../dev/utils";

async function main() {
  header("Set Admin");

  const { cp, net, addr, signer } = await context();
  const from = await signer.getAddress();

  const newAdmin = process.env.NEW_ADMIN || process.env.ADMIN_ADDRESS;
  if (!newAdmin) throw new Error("Set NEW_ADMIN=0x... (or ADMIN_ADDRESS) in env.");
  requireHexAddress("NEW_ADMIN", newAdmin);

  const current = await cp.admin();
  info("Network", net);
  info("Sender ", from);
  info("Contract", addr);
  info("Current", current);
  info("New    ", newAdmin);

  if (current.toLowerCase() === newAdmin.toLowerCase()) {
    console.log("⚠️  Already set. Nothing to do.");
    return;
  }

  await confirmDangerousAction(`set admin to ${newAdmin} on ${net}`);
  const tx = await cp.setAdmin(newAdmin);
  const rec = await tx.wait();
  info("Tx   ", tx.hash);
  info("Block", rec.blockNumber);

  const after = await cp.admin();
  info("Updated", after);
}

main().catch(fail);