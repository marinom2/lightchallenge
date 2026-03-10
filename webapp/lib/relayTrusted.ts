import type { Address, Hex } from "viem";
import type { WalletClient } from "viem";
import { buildForwardRequest, signForwardRequest } from "./trustedForwarder";

export async function relayTrustedMetaTx(params: {
  forwarder: Address;
  from: Address;
  to: Address;
  data: Hex;
  walletClient: WalletClient;

  value?: bigint;
  gas?: bigint;
  deadline?: bigint; // e.g. now+300s
}) {
  const req = await buildForwardRequest({
    forwarder: params.forwarder,
    from: params.from,
    to: params.to,
    data: params.data,
    value: params.value,
    gas: params.gas,
    deadline: params.deadline ?? 0n,
  });

  const sig = await signForwardRequest({
    forwarder: params.forwarder,
    req,
    walletClient: params.walletClient,
  });

  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ req, sig }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Relay failed");
  return json.hash as string;
}
