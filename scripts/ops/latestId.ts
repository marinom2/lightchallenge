// scripts/ops/latestId.ts
import { context, fail, latestId } from "../dev/utils";

async function main() {
  const { cp } = await context();
  const id = await latestId(cp);
  console.log(id === null ? "-1" : id.toString());
}
main().catch(fail);