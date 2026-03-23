/**
 * discord-bot/src/ai.ts
 *
 * AI assistant engine powered by Claude. Handles:
 * - System prompt with baked-in LightChallenge knowledge
 * - Conversation memory per channel (last 5 messages, 30min TTL)
 * - Rate limiting (10 requests/user/hour)
 * - Response generation with the Anthropic SDK
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MEMORY_MAX_MESSAGES = 5;

// ─── Anthropic Client ────────────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the official LightChallenge AI assistant on Discord. You help users understand the platform, answer questions about challenges, tournaments, fitness integrations, gaming, wallets, rewards, and smart contracts.

Be concise — Discord messages should be clear and scannable. Use short paragraphs and bullet points. Keep responses under 3500 characters.

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

Use \`/bracket\`, \`/standings\`, and \`/schedule\` to track tournaments.

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

- **ChallengePay** (\`0x5d630768BC194B5B840E3e8494037dBEeB06Cf9B\`) — Core contract for challenge lifecycle, stakes, and payouts. Supports create, join, submitProofFor, finalize, claimWinner, claimLoser, claimRefund, autoDistribute, autoRefund.
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

## Available Bot Commands

**Tournament:** \`/bracket\`, \`/standings\`, \`/schedule\`, \`/leaderboard\`
**Player:** \`/register\`, \`/profile\`
**Fitness:** \`/workout\`
**AI Assistant:** \`/ask\`, \`/explain\`
**Info:** \`/faq\`, \`/docs\`, \`/help\`
**Support:** \`/ticket\`, \`/close-ticket\`
**Admin:** \`/setup-server\`, \`/link-channel\`, \`/report\`, \`/warn\`, \`/mute\`

When answering, be helpful, accurate, and friendly. If you don't know something specific, say so rather than guessing. Point users to the web app or relevant bot commands when appropriate.`;

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/** Map of userId -> array of request timestamps */
const rateLimitMap = new Map<string, number[]>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = rateLimitMap.get(userId);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(userId, timestamps);
  }

  // Prune expired entries
  const filtered = timestamps.filter((t) => t > cutoff);
  rateLimitMap.set(userId, filtered);

  if (filtered.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = filtered[0]!;
    const retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  filtered.push(now);
  return { allowed: true };
}

// ─── Conversation Memory ─────────────────────────────────────────────────────

type MemoryEntry = {
  role: "user" | "assistant";
  content: string;
};

type ChannelMemory = {
  messages: MemoryEntry[];
  lastActivity: number;
};

const channelMemoryMap = new Map<string, ChannelMemory>();

/** Periodically clean up stale channel memory (every 10 minutes). */
setInterval(() => {
  const now = Date.now();
  for (const [channelId, mem] of channelMemoryMap) {
    if (now - mem.lastActivity > MEMORY_TTL_MS) {
      channelMemoryMap.delete(channelId);
    }
  }
}, 10 * 60 * 1000);

function getChannelMemory(channelId: string): MemoryEntry[] {
  const mem = channelMemoryMap.get(channelId);
  if (!mem) return [];
  // Check TTL
  if (Date.now() - mem.lastActivity > MEMORY_TTL_MS) {
    channelMemoryMap.delete(channelId);
    return [];
  }
  return mem.messages;
}

function addToChannelMemory(
  channelId: string,
  role: "user" | "assistant",
  content: string
): void {
  let mem = channelMemoryMap.get(channelId);
  if (!mem) {
    mem = { messages: [], lastActivity: Date.now() };
    channelMemoryMap.set(channelId, mem);
  }
  mem.lastActivity = Date.now();
  mem.messages.push({ role, content });
  // Keep only the last N messages
  if (mem.messages.length > MEMORY_MAX_MESSAGES * 2) {
    mem.messages = mem.messages.slice(-MEMORY_MAX_MESSAGES * 2);
  }
}

// ─── AI Response Generation ──────────────────────────────────────────────────

export type AiResponse = {
  content: string;
  truncated: boolean;
};

/**
 * Generate an AI response for a user question.
 * Includes conversation memory from the channel for follow-up context.
 */
export async function generateResponse(
  question: string,
  channelId: string
): Promise<AiResponse> {
  const client = getClient();

  // Build messages with conversation history
  const history = getChannelMemory(channelId);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user", content: question },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  });

  // Extract text content
  let content = "";
  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;
    }
  }

  // Store in channel memory
  addToChannelMemory(channelId, "user", question);
  addToChannelMemory(channelId, "assistant", content);

  // Discord embed description max is 4096 chars
  let truncated = false;
  if (content.length > 4000) {
    content = content.slice(0, 3997) + "...";
    truncated = true;
  }

  return { content, truncated };
}

/**
 * Generate a detailed explanation for a pre-defined topic.
 */
export async function generateExplanation(
  topic: string,
  topicLabel: string
): Promise<AiResponse> {
  const client = getClient();

  const prompt = `Give a detailed, well-structured explanation about "${topicLabel}" on the LightChallenge platform. Include practical details, step-by-step guidance where relevant, and any tips for users. Format for Discord readability with short paragraphs and bullet points.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  let content = "";
  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;
    }
  }

  let truncated = false;
  if (content.length > 4000) {
    content = content.slice(0, 3997) + "...";
    truncated = true;
  }

  return { content, truncated };
}
