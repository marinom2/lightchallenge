/**
 * discord-bot/src/faq.ts
 *
 * FAQ system — /faq <topic> and keyword-trigger responses.
 */

import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lightchallenge.app";

// ─── FAQ Topics ──────────────────────────────────────────────────────────────

export type FaqTopic = {
  key: string;
  title: string;
  description: string;
  color: number;
};

export const FAQ_TOPICS: FaqTopic[] = [
  {
    key: "getting-started",
    title: "Getting Started with LightChallenge",
    description:
      `**1. Connect your wallet**\nVisit [LightChallenge](${APP_URL}) and connect a wallet on the LightChain network.\n\n` +
      `**2. Link your Discord**\nUse \`/register <competition_id> <wallet>\` to link your wallet.\n\n` +
      `**3. Join a challenge**\nBrowse open tournaments or fitness challenges on the [web app](${APP_URL}).\n\n` +
      `**4. Compete and earn**\nComplete challenges, submit proofs, and earn LCAI rewards!`,
    color: 0x5865f2,
  },
  {
    key: "tournaments",
    title: "How Tournaments Work",
    description:
      "LightChallenge supports multiple tournament formats:\n\n" +
      "**Brackets** — Single/double elimination. Win to advance, lose and you are out (or drop to losers bracket).\n\n" +
      "**Swiss** — All players play a set number of rounds. Paired by similar records each round.\n\n" +
      "**Series** — Best-of-N matches between two players.\n\n" +
      `Use \`/bracket\`, \`/standings\`, and \`/schedule\` to track your tournaments.\n\n[Browse Tournaments](${APP_URL}/competitions)`,
    color: 0xfee75c,
  },
  {
    key: "fitness",
    title: "Fitness Challenges",
    description:
      "LightChallenge fitness challenges use real health data for automatic proof:\n\n" +
      "**Supported integrations:** Apple Health (via iOS app)\n\n" +
      "**How it works:**\n" +
      "1. Join a fitness challenge on the web or iOS app\n" +
      "2. Complete your workouts — steps, calories, distance, etc.\n" +
      "3. Your health data is automatically submitted as proof\n" +
      "4. AI verification confirms your activity\n" +
      "5. Earn LCAI rewards for completing challenges!\n\n" +
      `**Supported workout types:** Running, Walking, Cycling, Swimming, Strength Training, HIIT, Yoga, and more.\n\n[Browse Fitness Challenges](${APP_URL}/challenges)`,
    color: 0x2ecc71,
  },
  {
    key: "rewards",
    title: "LCAI Rewards & Prize Pools",
    description:
      "**LCAI** is the native token of the LightChain network.\n\n" +
      "**How rewards work:**\n" +
      "- Challenges have prize pools funded by entry fees\n" +
      "- Winners receive their share after AI verification\n" +
      "- Failed challenges may forfeit their stake\n" +
      "- Refunds are issued if a challenge is canceled\n\n" +
      "**Prize distribution:**\n" +
      "- Winners can claim via `claimWinner` on-chain\n" +
      "- Auto-distribution is available for finalized challenges\n" +
      "- All transactions happen on LightChain testnet\n\n" +
      `[Learn more](${APP_URL})`,
    color: 0xe67e22,
  },
  {
    key: "verification",
    title: "AI Verification (AIVM)",
    description:
      "LightChallenge uses LightChain's **AIVM** (AI Virtual Machine) for proof verification:\n\n" +
      "**How it works:**\n" +
      "1. You submit proof (workout data, screenshots, etc.)\n" +
      "2. The proof is sent to AIVM for inference\n" +
      "3. AIVM workers process and verify the proof\n" +
      "4. Results go through commit/reveal/attestation\n" +
      "5. The on-chain verifier confirms the result\n\n" +
      "This ensures fair, transparent, and tamper-proof verification of all challenge completions.",
    color: 0x3498db,
  },
  {
    key: "wallets",
    title: "Setting Up a Wallet for LightChain",
    description:
      "**To participate in LightChallenge, you need a wallet on LightChain testnet.**\n\n" +
      "**Setup:**\n" +
      "1. Install MetaMask or any EVM-compatible wallet\n" +
      "2. Add the LightChain testnet:\n" +
      "   - **Network:** LightChain Testnet\n" +
      "   - **Chain ID:** 504\n" +
      "   - **RPC:** `https://light-testnet-rpc.lightchain.ai`\n" +
      "3. Get testnet LCAI from a faucet\n" +
      `4. Connect at [LightChallenge](${APP_URL})\n\n` +
      "**Link to Discord:** Use `/register` with your wallet address.",
    color: 0x9b59b6,
  },
];

export function buildFaqEmbed(topic: FaqTopic): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(topic.title)
    .setDescription(topic.description)
    .setColor(topic.color)
    .setFooter({ text: "LightChallenge FAQ" })
    .setTimestamp();
}

export function buildDocsIndexEmbed(): EmbedBuilder {
  const lines = FAQ_TOPICS.map((t) => `\`/faq ${t.key}\` — ${t.title}`);
  return new EmbedBuilder()
    .setTitle("LightChallenge Documentation")
    .setDescription(
      "Use `/faq <topic>` to learn more about any topic:\n\n" +
      lines.join("\n") +
      `\n\n[Visit the Web App](${APP_URL})`
    )
    .setColor(0x5865f2)
    .setFooter({ text: "LightChallenge Documentation" })
    .setTimestamp();
}

// ─── Keyword Triggers ────────────────────────────────────────────────────────

type KeywordTrigger = {
  patterns: RegExp[];
  topicKey: string;
  hint: string;
};

const KEYWORD_TRIGGERS: KeywordTrigger[] = [
  {
    patterns: [/how\s+do\s+i\s+join/i, /how\s+to\s+join/i, /how\s+to\s+start/i],
    topicKey: "getting-started",
    hint: "Looks like you want to get started!",
  },
  {
    patterns: [/what\s+is\s+lcai/i, /what('s|\s+is)\s+the\s+token/i],
    topicKey: "rewards",
    hint: "Here is some info about LCAI:",
  },
  {
    patterns: [/how\s+does\s+verification\s+work/i, /how\s+is\s+proof\s+verified/i, /what\s+is\s+aivm/i],
    topicKey: "verification",
    hint: "Here is how verification works:",
  },
];

/**
 * Check a message for keyword triggers and respond with the relevant FAQ embed.
 * Returns true if a response was sent.
 */
export async function handleFaqKeywords(message: Message): Promise<boolean> {
  if (message.author.bot) return false;
  if (!message.guild) return false;

  const content = message.content;
  for (const trigger of KEYWORD_TRIGGERS) {
    for (const pattern of trigger.patterns) {
      if (pattern.test(content)) {
        const topic = FAQ_TOPICS.find((t) => t.key === trigger.topicKey);
        if (!topic) continue;
        const embed = buildFaqEmbed(topic);
        await message.reply({
          content: trigger.hint,
          embeds: [embed],
        });
        return true;
      }
    }
  }
  return false;
}
