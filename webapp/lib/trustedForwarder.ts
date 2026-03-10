import type { Address, Hex } from "viem";
import type { WalletClient } from "viem";
import { publicClient } from "./viem";
import { trustedForwarderAbi } from "./contracts/trustedForwarderAbi";

export type ForwardRequest = {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: bigint; // 0n = no deadline
  data: Hex;
};

const EIP712_DOMAIN = (chainId: number, verifyingContract: Address) => ({
  name: "TrustedForwarder",
  version: "1",
  chainId,
  verifyingContract,
});

const EIP712_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

export async function buildForwardRequest(params: {
  forwarder: Address;
  from: Address;
  to: Address;
  data: Hex;
  value?: bigint;
  gas?: bigint;
  deadline?: bigint; // unix seconds, or 0n
}): Promise<ForwardRequest> {
  const { forwarder, from, to, data } = params;
  const value = params.value ?? 0n;
  const gas = params.gas ?? 900_000n;
  const deadline = params.deadline ?? 0n;

  // Optional: check target allowlist early (nice UX)
  const allowed = await publicClient.readContract({
    address: forwarder,
    abi: trustedForwarderAbi,
    functionName: "isTargetAllowed",
    args: [to],
  });
  if (!allowed) throw new Error("Target not allowed in forwarder");

  const nonce = (await publicClient.readContract({
    address: forwarder,
    abi: trustedForwarderAbi,
    functionName: "nonces",
    args: [from],
  })) as bigint;

  return { from, to, value, gas, nonce, deadline, data };
}

export async function signForwardRequest(params: {
  forwarder: Address;
  req: ForwardRequest;
  walletClient: WalletClient;
}): Promise<Hex> {
  const walletClient = params.walletClient;

  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error("No wallet account");

  if (account.toLowerCase() !== params.req.from.toLowerCase()) {
    throw new Error(`Wallet mismatch: wallet=${account} req.from=${params.req.from}`);
  }

  const chainId = await publicClient.getChainId();

  return walletClient.signTypedData({
    account,
    domain: EIP712_DOMAIN(chainId, params.forwarder),
    types: EIP712_TYPES,
    primaryType: "ForwardRequest",
    message: params.req,
  });
}
