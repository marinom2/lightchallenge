import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ─── System Prompt (same knowledge base as Discord bot) ─────────────────────

const SYSTEM_PROMPT = `You are the official LightChallenge AI assistant. You help users understand the platform, answer questions about challenges, tournaments, fitness integrations, gaming, wallets, rewards, and smart contracts.

Be concise and helpful. Use short paragraphs and bullet points. Keep responses clear and scannable.

## About LightChallenge

LightChallenge is a stake-weighted, permissionless challenge protocol built on the LightChain testnet (chain ID 504). Participants create challenges backed by on-chain stakes, submit activity or gaming evidence, and earn LCAI rewards when an AI model verifies their performance.

**Web App:** https://uat.lightchallenge.app

## How Challenges Work

1. **Create** — A creator defines the challenge (type, rules, duration, entry fee in LCAI)
2. **Join** — Participants join by staking the entry fee on-chain via ChallengePay
3. **Prove** — During the challenge period, participants complete activities and submit proof (automatic via fitness integrations or manual upload)
4. **Verify** — LightChain's AIVM (AI Virtual Machine) verifies submitted proofs through commit/reveal/attestation
5. **Claim** — After finalization, winners claim their rewards on-chain; losers forfeit their stake

Challenge statuses: Active -> Finalized (Success/Fail) -> Claimed/Refunded

## Tournament Formats

LightChallenge supports competitive tournaments:
- **Single Elimination (Bracket)** — Win to advance, lose and you're out
- **Double Elimination** — Drop to losers bracket on first loss, eliminated on second
- **Swiss** — All players play a set number of rounds, paired by similar records
- **Series** — Best-of-N matches between two players
- **Round Robin** — Every participant plays every other participant

## Fitness Integrations

**Apple Health (iOS app, HealthKit)** — Primary integration, supports all activity types:
- Steps (pedometer, cross-activity)
- Running — distance, duration
- Walking — distance, duration
- Hiking — distance, elevation gain
- Cycling — distance
- Swimming — distance
- Strength Training — duration, sessions
- Yoga — duration, sessions
- HIIT / CrossFit / Mixed Cardio — duration, sessions
- Rowing — distance, duration
- Calories (active energy burned, cross-activity)
- Exercise Time (cross-activity)

**How fitness proof works:**
1. Connect Apple Health in the iOS app
2. Your workouts are automatically synced as evidence
3. The evaluator checks your activity against challenge rules
4. AIVM verifies the proof on-chain
5. Results are finalized automatically

**Other fitness platforms (status):**
- Strava — Integration available for run/cycle/swim data
- Garmin — Manual export supported
- Fitbit — Manual export supported
- Google Fit — Manual export supported

## Gaming Integrations

Gaming challenges are desktop-only on iOS (spectate only on mobile):
- **Dota 2** — via OpenDota API (match history, hero stats, win/loss)
- **CS2 (Counter-Strike 2)** — via FACEIT API
- **League of Legends** — via Riot Games API
- **Valorant** — via Riot Games API
- **FACEIT** — Cross-game competitive platform integration

## LCAI Token & Rewards

- **LCAI** is the native token of the LightChain network
- Challenges have prize pools funded by participant entry fees
- Winners receive their share after AI verification
- Failed challenges may forfeit the participant's stake
- Refunds are issued if a challenge is canceled before completion
- All transactions happen on LightChain testnet

## Smart Contracts

All contracts are deployed on LightChain testnet (chain ID 504):

- **ChallengePay** (\`0x5d630768BC194B5B840E3e8494037dBEeB06Cf9B\`) — Core contract for challenge lifecycle, stakes, and payouts
- **Treasury** — DAO treasury with bucketed custody and pull-based claims
- **EventChallengeRouter** (\`0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D\`) — Multi-outcome event routing
- **ChallengePayAivmPoiVerifier** — AIVM Proof-of-Inference adapter (active verifier)
- **ChallengeTaskRegistry** — Binds challenges to AIVM task IDs
- **MetadataRegistry** — On-chain metadata URI pointers
- **TrustedForwarder** — EIP-2771 gasless transactions
- **ChallengeAchievement** — Soulbound ERC-721 + ERC-5192 NFTs for achievements

## Wallet Setup

To participate:
1. Install MetaMask or any EVM-compatible wallet
2. Add LightChain testnet:
   - Network Name: LightChain Testnet
   - Chain ID: 504
   - RPC URL: https://light-testnet-rpc.lightchain.ai
   - Currency: LCAI
3. Get testnet LCAI from a faucet
4. Connect wallet at https://uat.lightchallenge.app

## AI Verification (AIVM)

LightChain's AI Virtual Machine provides trustless proof verification:
1. Proof is submitted to AIVM via requestInferenceV2
2. Lightchain network workers process the inference
3. Workers go through commit -> reveal -> attestation until quorum
4. InferenceFinalized event triggers on-chain
5. The indexer calls submitProofFor + finalize on ChallengePay
6. On-chain verifier (ChallengePayAivmPoiVerifier) confirms the result

When answering, be helpful, accurate, and friendly. If you don't know something specific, say so rather than guessing. Point users to the relevant pages on the web app when appropriate.`;

// ─── Anthropic Client (singleton) ───────────────────────────────────────────

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ─── Rate Limiting (in-memory, per wallet address) ──────────────────────────

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(address: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = rateLimitMap.get(address);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(address, timestamps);
  }

  const filtered = timestamps.filter((t) => t > cutoff);
  rateLimitMap.set(address, filtered);

  if (filtered.length >= RATE_LIMIT_MAX) {
    const oldest = filtered[0]!;
    const retryAfterMs = oldest + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  filtered.push(now);
  return { allowed: true };
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Rate limit by wallet address
    const address = req.headers.get("x-lc-address") ?? "anonymous";
    const rl = checkRateLimit(address);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Rate limited. Try again in ${rl.retryAfterSeconds}s.` },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { message, history } = body as {
      message: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Build messages array
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: message.trim() });

    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });

    let reply = "";
    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      }
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("[ai/chat] Error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
