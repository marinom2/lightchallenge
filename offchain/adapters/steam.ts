// /offchain/adapters/steam.ts
// Turn a Steam OpenID login result into a steamid64 and store it via your identity registry.

import { bindIdentity } from "../identity/registry";

/**
 * Example claimed_id:
 *   "https://steamcommunity.com/openid/id/76561198000000000"
 * Steam's canonical form is ".../openid/id/<steamid64>" — be strict.
 */
export function extractSteamId64FromClaimedId(claimedId: string): string {
  const m = claimedId.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/);
  if (!m) throw new Error(`Cannot parse Steam claimed_id (expected /openid/id/<id>): ${claimedId}`);
  return m[1];
}

/**
 * Persist the wallet ↔ steamid64 binding, signed by the user’s wallet (or your operator key).
 * provider: "steam" (use the same provider label your registry expects)
 */
export function saveSteamBinding(args: {
  signerPk: string;                // wallet private key used to sign the binding message
  wallet: `0x${string}`;           // user wallet
  claimedId: string;               // Steam OpenID claimed_id
  handle?: string;                 // vanity/profile name (optional)
}) {
  const steamid64 = extractSteamId64FromClaimedId(args.claimedId);
  return bindIdentity(args.signerPk, args.wallet, "steam", steamid64, args.handle);
}