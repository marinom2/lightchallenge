export function isHexAddress(x: unknown): x is `0x${string}` {
    return typeof x === "string" && /^0x[a-fA-F0-9]{40}$/.test(x);
  }
  
  export function shortenAddress(addr: string, n = 4) {
    if (!addr?.startsWith("0x") || addr.length < 10) return addr || "";
    return `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`;
  }