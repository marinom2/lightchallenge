/**
 * TokenPriceService — fetches live LCAI/USD price.
 * Sources (priority): CoinGecko → GeckoTerminal → Uniswap V3 subgraph.
 * Token: 0x9ca8530ca349c966fe9ef903df17a75b8a778927 (Ethereum mainnet)
 *
 * Server-side: called from API routes with 60s cache.
 * Client-side: fetched via /api/token-price endpoint.
 */

const TOKEN_ADDRESS = "0x9ca8530ca349c966fe9ef903df17a75b8a778927";
const CACHE_DURATION_MS = 60_000; // 1 minute

let cachedPrice: number | null = null;
let cacheTimestamp = 0;

/** Fetch USD price per LCAI token. Returns cached value if fresh. */
export async function getTokenPriceUSD(): Promise<number | null> {
  const now = Date.now();
  if (cachedPrice !== null && now - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedPrice;
  }

  const price =
    (await fetchFromCoinGecko()) ??
    (await fetchFromGeckoTerminal()) ??
    (await fetchFromUniswap());

  if (price !== null) {
    cachedPrice = price;
    cacheTimestamp = now;
  }

  return price ?? cachedPrice; // return stale cache if all fail
}

// ── CoinGecko (primary) ──────────────────────────────────────────────────

async function fetchFromCoinGecko(): Promise<number | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${TOKEN_ADDRESS}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.[TOKEN_ADDRESS]?.usd;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ── GeckoTerminal (fallback 1) ───────────────────────────────────────────

async function fetchFromGeckoTerminal(): Promise<number | null> {
  try {
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/eth/token_price/${TOKEN_ADDRESS}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const priceStr = json?.data?.attributes?.token_prices?.[TOKEN_ADDRESS];
    const price = priceStr ? Number(priceStr) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ── Uniswap V3 subgraph (fallback 2) ────────────────────────────────────

async function fetchFromUniswap(): Promise<number | null> {
  try {
    const url = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";
    const query = `{
      token(id: "${TOKEN_ADDRESS}") { derivedETH }
      bundle(id: "1") { ethPriceUSD }
    }`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const derivedETH = Number(json?.data?.token?.derivedETH);
    const ethPriceUSD = Number(json?.data?.bundle?.ethPriceUSD);
    if (!Number.isFinite(derivedETH) || !Number.isFinite(ethPriceUSD)) return null;
    const price = derivedETH * ethPriceUSD;
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ── USD formatting helpers ───────────────────────────────────────────────

/** Format a USDC value with appropriate precision. */
function formatUSDCValue(usd: number): string {
  if (usd >= 1000) return `${usd.toFixed(0)} USDC`;
  if (usd >= 1) return `${usd.toFixed(2)} USDC`;
  if (usd >= 0.01) return `${usd.toFixed(3)} USDC`;
  return `${usd.toFixed(4)} USDC`;
}

/** Format LCAI amount with appropriate precision. */
function formatLCAIValue(lcai: number): string {
  if (lcai >= 1000) return `${lcai.toFixed(0)} LCAI`;
  if (lcai >= 1) return `${lcai.toFixed(2)} LCAI`;
  if (lcai >= 0.01) return `${lcai.toFixed(3)} LCAI`;
  if (lcai >= 0.0001) return `${lcai.toFixed(4)} LCAI`;
  if (lcai > 0) return `${lcai.toFixed(6)} LCAI`;
  return "0 LCAI";
}

/** Format a wei string as USDC using the given token price. Falls back to LCAI. */
export function formatWeiAsUSD(weiStr: string | null | undefined, tokenPrice: number | null): string {
  if (!weiStr) return "0 LCAI";
  try {
    const wei = BigInt(weiStr);
    const lcai = Number(wei) / 1e18;
    if (lcai === 0) return "0 LCAI";
    if (tokenPrice && tokenPrice > 0) {
      const usd = lcai * tokenPrice;
      // If USD rounds to 0 at 4dp but LCAI is non-zero, show LCAI instead
      if (usd < 0.00005 && lcai > 0) return formatLCAIValue(lcai);
      return formatUSDCValue(usd);
    }
    return formatLCAIValue(lcai);
  } catch {
    return "0 LCAI";
  }
}

/** Format a plain LCAI amount as USDC. */
export function formatLCAIAsUSD(lcai: number, tokenPrice: number | null): string {
  if (tokenPrice && tokenPrice > 0) {
    return formatUSDCValue(lcai * tokenPrice);
  }
  if (lcai >= 1000) return `${lcai.toFixed(0)} LCAI`;
  return `${lcai.toFixed(2)} LCAI`;
}
