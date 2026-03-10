export const trustedForwarderAbi = [
    {
      type: "function",
      name: "nonces",
      stateMutability: "view",
      inputs: [{ name: "from", type: "address" }],
      outputs: [{ name: "nonce", type: "uint256" }],
    },
    {
      type: "function",
      name: "isTargetAllowed",
      stateMutability: "view",
      inputs: [{ name: "target", type: "address" }],
      outputs: [{ name: "allowed", type: "bool" }],
    },
    {
      type: "function",
      name: "restrictRelayers",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "restricted", type: "bool" }],
    },
    {
      type: "function",
      name: "isRelayerAllowed",
      stateMutability: "view",
      inputs: [{ name: "relayer", type: "address" }],
      outputs: [{ name: "allowed", type: "bool" }],
    },
    {
      type: "function",
      name: "verify",
      stateMutability: "view",
      inputs: [
        {
          name: "req",
          type: "tuple",
          components: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        { name: "sig", type: "bytes" },
      ],
      outputs: [{ name: "ok", type: "bool" }],
    },
    {
      type: "function",
      name: "execute",
      stateMutability: "payable",
      inputs: [
        {
          name: "req",
          type: "tuple",
          components: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        { name: "sig", type: "bytes" },
      ],
      outputs: [{ name: "ret", type: "bytes" }],
    },
  ] as const;