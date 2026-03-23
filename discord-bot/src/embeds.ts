/**
 * discord-bot/src/embeds.ts
 *
 * Rich embed builders for Discord messages.
 */

import { EmbedBuilder } from "discord.js";
import type { BracketMatch, StandingRow, Competition } from "./db.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Shorten a wallet address for display. */
export function shortAddr(addr: string | null): string {
  if (!addr) return "TBD";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Shorten a wallet address for display, preferring a display name if available. */
export function shortAddrOrName(addr: string | null, names?: Record<string, string>): string {
  if (!addr) return "TBD";
  if (names) {
    const name = names[addr.toLowerCase()];
    if (name) return name;
  }
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Label for a round number (R1, QF, SF, Final, etc.) given total rounds. */
function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Quarterfinal";
  return `Round ${round}`;
}

/** Build a text progress bar. */
export function progressBar(completed: number, total: number, length: number = 10): string {
  if (total === 0) return "░".repeat(length);
  const filled = Math.round((completed / total) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

// ─── Bracket Embed ──────────────────────────────────────────────────────────

/**
 * Build a text-art bracket displayed in a code block.
 * Groups matches by bracket_type and round.
 */
export function buildBracketEmbed(matches: BracketMatch[], competitionName: string): EmbedBuilder {
  const totalRounds = Math.max(...matches.map((m) => m.round), 0);

  // Group by bracket_type, then by round
  const grouped: Record<string, Record<number, BracketMatch[]>> = {};
  for (const m of matches) {
    if (!grouped[m.bracket_type]) grouped[m.bracket_type] = {};
    if (!grouped[m.bracket_type][m.round]) grouped[m.bracket_type][m.round] = [];
    grouped[m.bracket_type][m.round].push(m);
  }

  const lines: string[] = [];

  for (const bracketType of ["winners", "losers", "grand_final"] as const) {
    const rounds = grouped[bracketType];
    if (!rounds) continue;

    const label = bracketType === "winners" ? "Winners Bracket"
      : bracketType === "losers" ? "Losers Bracket"
      : "Grand Final";
    lines.push(`=== ${label} ===`);
    lines.push("");

    const sortedRounds = Object.keys(rounds).map(Number).sort((a, b) => a - b);
    for (const round of sortedRounds) {
      const roundMatches = rounds[round];
      const maxRound = bracketType === "winners" ? totalRounds : Math.max(...sortedRounds);
      lines.push(`--- ${roundLabel(round, maxRound)} ---`);

      for (const m of roundMatches) {
        const statusIcon = m.status === "completed" ? "+" : m.status === "in_progress" ? ">" : " ";
        const pA = shortAddr(m.participant_a);
        const pB = shortAddr(m.participant_b);
        const scoreStr = m.status === "completed"
          ? `  ${m.score_a ?? 0} - ${m.score_b ?? 0}`
          : "";

        const winMarkerA = m.winner && m.winner === m.participant_a ? " *" : "";
        const winMarkerB = m.winner && m.winner === m.participant_b ? " *" : "";

        lines.push(`${statusIcon} M${m.match_number}: ${pA}${winMarkerA} vs ${pB}${winMarkerB}${scoreStr}`);
      }
      lines.push("");
    }
  }

  const description = lines.length > 0
    ? `\`\`\`diff\n${lines.join("\n").trimEnd()}\n\`\`\``
    : "No matches found.";

  const completed = matches.filter((m) => m.status === "completed").length;
  const total = matches.filter((m) => m.status !== "bye").length;

  return new EmbedBuilder()
    .setTitle(`Bracket: ${competitionName}`)
    .setDescription(description)
    .setFooter({ text: `${completed}/${total} matches completed` })
    .setColor(0x6b5cff)
    .setTimestamp();
}

// ─── Match Result Embed ─────────────────────────────────────────────────────

export function buildMatchResultEmbed(
  match: {
    participant_a: string | null;
    participant_b: string | null;
    score_a: number | null;
    score_b: number | null;
    winner: string | null;
    round: number;
    match_number: number;
    bracket_type: string;
  },
  competitionName: string
): EmbedBuilder {
  const pA = shortAddr(match.participant_a);
  const pB = shortAddr(match.participant_b);
  const winner = match.winner === match.participant_a ? pA : pB;

  return new EmbedBuilder()
    .setTitle("Match Result")
    .setDescription(
      `**${pA}** ${match.score_a ?? 0} - ${match.score_b ?? 0} **${pB}**`
    )
    .addFields(
      { name: "Competition", value: competitionName, inline: true },
      { name: "Round", value: `R${match.round}`, inline: true },
      { name: "Match", value: `#${match.match_number}`, inline: true },
      { name: "Winner", value: `**${winner}**`, inline: true },
      { name: "Bracket", value: match.bracket_type, inline: true }
    )
    .setColor(0x57f287) // green
    .setTimestamp();
}

// ─── Standings Embed ────────────────────────────────────────────────────────

export function buildStandingsEmbed(
  standings: (StandingRow & { rank: number })[],
  type: string,
  competitionName: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Standings: ${competitionName}`)
    .setColor(0x6b5cff)
    .setTimestamp();

  if (standings.length === 0) {
    embed.setDescription("No results yet.");
    return embed;
  }

  if (type === "swiss") {
    // Swiss: W-L with Buchholz-style tiebreak (using score diff as proxy)
    const header = "```\n#  | Player         | W-L-D | Pts | +/-\n" + "-".repeat(50);
    const rows = standings.map((s) => {
      const diff = s.score_for - s.score_against;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      return `${String(s.rank).padStart(2)} | ${shortAddr(s.wallet).padEnd(14)} | ${s.wins}-${s.losses}-${s.draws} | ${String(s.points).padStart(3)} | ${diffStr}`;
    });
    embed.setDescription(`${header}\n${rows.join("\n")}\n\`\`\``);
  } else if (type === "bracket") {
    // Bracket: remaining participants (those who haven't lost, or fewest losses)
    const rows = standings.map((s) => {
      const status = s.losses === 0 ? "Active" : "Eliminated";
      return `**${s.rank}.** ${shortAddr(s.wallet)} - ${s.wins}W ${s.losses}L (${status})`;
    });
    embed.setDescription(rows.join("\n"));
  } else {
    // Round-robin / league / default: full standings table
    const header = "```\n#  | Player         | W-L-D | Pts | GF-GA\n" + "-".repeat(52);
    const rows = standings.map((s) =>
      `${String(s.rank).padStart(2)} | ${shortAddr(s.wallet).padEnd(14)} | ${s.wins}-${s.losses}-${s.draws} | ${String(s.points).padStart(3)} | ${s.score_for}-${s.score_against}`
    );
    embed.setDescription(`${header}\n${rows.join("\n")}\n\`\`\``);
  }

  embed.setFooter({ text: `${type} format | ${standings.length} participants` });
  return embed;
}

// ─── Announcement Embeds ────────────────────────────────────────────────────

export function buildAnnouncementEmbed(
  competition: { title: string; type: string; description?: string | null; category?: string | null },
  announcementType: "started" | "completed",
  extra?: { winner?: string; finalStandings?: (StandingRow & { rank: number })[] }
): EmbedBuilder {
  if (announcementType === "started") {
    return new EmbedBuilder()
      .setTitle(`Competition Started: ${competition.title}`)
      .setDescription(
        competition.description
          ? `${competition.description}\n\nThe bracket is live! Use \`/bracket\` to see matchups.`
          : "The bracket is live! Use `/bracket` to see matchups."
      )
      .addFields(
        { name: "Type", value: competition.type, inline: true },
        ...(competition.category ? [{ name: "Category", value: competition.category, inline: true }] : [])
      )
      .setColor(0x5865f2) // blurple
      .setTimestamp();
  }

  // completed
  const embed = new EmbedBuilder()
    .setTitle(`Competition Complete: ${competition.title}`)
    .setColor(0xfee75c) // gold
    .setTimestamp();

  const lines: string[] = [];
  if (extra?.winner) {
    lines.push(`**Winner:** ${shortAddr(extra.winner)}`);
  }
  if (extra?.finalStandings && extra.finalStandings.length > 0) {
    lines.push("");
    lines.push("**Final Standings:**");
    const top = extra.finalStandings.slice(0, 8);
    const medals = ["1st", "2nd", "3rd"];
    for (const s of top) {
      const prefix = s.rank <= 3 ? `${medals[s.rank - 1]}` : `${s.rank}th`;
      lines.push(`${prefix} - ${shortAddr(s.wallet)} (${s.wins}W ${s.losses}L)`);
    }
  }
  embed.setDescription(lines.join("\n") || "The competition has concluded.");
  return embed;
}

// ─── Welcome Embed ──────────────────────────────────────────────────────────

export function buildWelcomeEmbed(competition: Competition): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Welcome to ${competition.title}!`)
    .setDescription(
      (competition.description ? `${competition.description}\n\n` : "") +
      "This channel is the dedicated hub for this tournament. " +
      "All match notifications, results, and updates will be posted here.\n\n" +
      "**Useful Commands:**\n" +
      `\`/bracket ${competition.id}\` - View bracket\n` +
      `\`/standings ${competition.id}\` - View standings\n` +
      `\`/schedule ${competition.id}\` - View upcoming matches\n` +
      `\`/register ${competition.id}\` - Register for this tournament`
    )
    .addFields(
      { name: "Type", value: competition.type, inline: true },
      { name: "Status", value: competition.status, inline: true },
      ...(competition.category ? [{ name: "Category", value: competition.category, inline: true }] : [])
    )
    .setColor(0x5865f2)
    .setTimestamp();

  if (competition.starts_at) {
    const ts = Math.floor(new Date(competition.starts_at).getTime() / 1000);
    embed.addFields({ name: "Starts", value: `<t:${ts}:R>`, inline: true });
  }

  return embed;
}
