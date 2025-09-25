import fs from "fs";
import path from "path";

/**
 * Where we store addresses for each network, e.g.:
 *   deployments/lightchain.json
 *   deployments/localhost.json
 *
 * You can override the file name by setting DEPLOYMENTS_NETWORK, e.g.:
 *   DEPLOYMENTS_NETWORK=localhost
 */
export function deploymentsPath(networkName?: string) {
  const net =
    networkName ||
    process.env.DEPLOYMENTS_NETWORK ||
    "lightchain";
  return path.join(process.cwd(), "deployments", `${net}.json`);
}

/** Read deployments JSON for the selected network. Returns {} if missing. */
export function readDeployments(networkName?: string): Record<string, string> {
  const p = deploymentsPath(networkName);
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/** Write deployments JSON for the selected network. */
export function writeDeployments(obj: Record<string, string>, networkName?: string) {
  const p = deploymentsPath(networkName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
