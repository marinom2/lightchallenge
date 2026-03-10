export function steam64To32(steam64: string): string {
    const base = BigInt("76561197960265728");
    return (BigInt(steam64) - base).toString();
  }