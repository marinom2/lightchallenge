import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { lightchain } from "@/lib/lightchain";
import { publicClient } from "@/lib/viem";
import { trustedForwarderAbi } from "@/lib/contracts/trustedForwarderAbi";

type ForwardRequest = {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: bigint;
  data: Hex;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const forwarder = process.env.NEXT_PUBLIC_TRUSTED_FORWARDER as Address | undefined;
    const relayerPk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;

    if (!forwarder) return NextResponse.json({ error: "Missing NEXT_PUBLIC_TRUSTED_FORWARDER" }, { status: 500 });
    if (!relayerPk) return NextResponse.json({ error: "Missing RELAYER_PRIVATE_KEY" }, { status: 500 });

    const req: ForwardRequest = body.req;
    const sig: Hex = body.sig;

    if (!req?.from || !req?.to || !req?.data || !sig) {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    }

    // Verify on-chain first (cheap view call)
    const ok = await publicClient.readContract({
      address: forwarder,
      abi: trustedForwarderAbi,
      functionName: "verify",
      args: [req, sig],
    });
    if (!ok) return NextResponse.json({ error: "Forwarder verify failed" }, { status: 400 });

    // Optional: if forwarder restricts relayers, check this server’s relayer address is allowed
    const relayerAccount = privateKeyToAccount(relayerPk);
    const restrict = await publicClient.readContract({
      address: forwarder,
      abi: trustedForwarderAbi,
      functionName: "restrictRelayers",
      args: [],
    });
    if (restrict) {
      const allowed = await publicClient.readContract({
        address: forwarder,
        abi: trustedForwarderAbi,
        functionName: "isRelayerAllowed",
        args: [relayerAccount.address],
      });
      if (!allowed) return NextResponse.json({ error: "Relayer not allowed" }, { status: 403 });
    }

    const walletClient = createWalletClient({
      chain: lightchain,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai"),
      account: relayerAccount,
    });

    // Simulate to catch revert reasons before paying gas
    const sim = await publicClient.simulateContract({
      address: forwarder,
      abi: trustedForwarderAbi,
      functionName: "execute",
      args: [req, sig],
      account: relayerAccount,
      value: req.value,
    });

    const hash = await walletClient.writeContract(sim.request);
    return NextResponse.json({ hash });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Relay failed" }, { status: 500 });
  }
}