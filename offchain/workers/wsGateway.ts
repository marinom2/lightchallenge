/**
 * offchain/workers/wsGateway.ts
 *
 * WebSocket gateway for live game event ingestion from desktop clients
 * and real-time bracket updates for spectators.
 *
 * Two client modes:
 *   1. "player" — desktop app streams GSI/LiveClient events
 *   2. "spectator" — frontend subscribes to competition bracket updates
 *
 * Protocol (JSON messages):
 *   → { type: "auth", wallet: "0x...", signature: "0x..." }
 *   → { type: "gsi_event", platform: "dota2"|"cs2"|"lol", data: {...} }
 *   → { type: "subscribe", competition_id: "uuid" }
 *   ← { type: "auth_ok", wallet: "0x..." }
 *   ← { type: "session_started", session_id: "uuid", platform: "dota2" }
 *   ← { type: "session_ended", session_id: "uuid", summary: {...} }
 *   ← { type: "bracket_update", competition_id: "uuid", match: {...} }
 *   ← { type: "error", message: "..." }
 *
 * Environment variables:
 *   DATABASE_URL          (required)
 *   WS_GATEWAY_PORT       (default 3100)
 *
 * Usage:
 *   npx tsx offchain/workers/wsGateway.ts
 */

import path from "path";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { verifyMessage } from "ethers";
import { sslConfig } from "../db/sslConfig";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[wsGateway] Missing DATABASE_URL");
  process.exit(1);
}

const PORT = Number(process.env.WS_GATEWAY_PORT || 3100);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 10,
});

// ── Types ────────────────────────────────────────────────────────────────────

type PlayerClient = {
  ws: WebSocket;
  wallet: string;
  authenticated: boolean;
  sessionId: string | null;
  platform: string | null;
  eventCount: number;
};

type SpectatorClient = {
  ws: WebSocket;
  competitionIds: Set<string>;
};

// ── State ────────────────────────────────────────────────────────────────────

const players = new Map<WebSocket, PlayerClient>();
const spectators = new Map<WebSocket, SpectatorClient>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[wsGateway ${new Date().toISOString()}] ${msg}`);
}

function send(ws: WebSocket, data: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ── Game session management ──────────────────────────────────────────────────

async function startSession(client: PlayerClient, platform: string): Promise<string> {
  const sessionId = randomUUID();
  await pool.query(
    `INSERT INTO public.game_sessions (id, wallet, platform, status, started_at)
     VALUES ($1, lower($2), $3, 'active', now())`,
    [sessionId, client.wallet, platform]
  );
  client.sessionId = sessionId;
  client.platform = platform;
  client.eventCount = 0;
  log(`session ${sessionId} started for ${client.wallet} (${platform})`);
  return sessionId;
}

async function endSession(client: PlayerClient, summary?: Record<string, unknown>) {
  if (!client.sessionId) return;

  await pool.query(
    `UPDATE public.game_sessions
     SET status = 'completed', ended_at = now(), event_count = $2, summary = $3::jsonb
     WHERE id = $1`,
    [client.sessionId, client.eventCount, JSON.stringify(summary ?? {})]
  );

  log(`session ${client.sessionId} ended (${client.eventCount} events)`);
  client.sessionId = null;
  client.platform = null;
}

async function storeEvent(
  client: PlayerClient,
  eventType: string,
  data: Record<string, unknown>
) {
  if (!client.sessionId || !client.platform) return;

  // Batch insert — we store raw events for later processing
  await pool.query(
    `INSERT INTO public.live_game_events (session_id, wallet, platform, event_type, data)
     VALUES ($1, lower($2), $3, $4, $5::jsonb)`,
    [client.sessionId, client.wallet, client.platform, eventType, JSON.stringify(data)]
  );
  client.eventCount++;
}

// ── GSI event processing ─────────────────────────────────────────────────────

function detectGameState(data: Record<string, unknown>): {
  eventType: string;
  isMatchStart: boolean;
  isMatchEnd: boolean;
  platform: string | null;
} {
  // Dota 2 GSI
  if (data.map && data.player) {
    const mapData = data.map as Record<string, unknown>;
    const gameState = mapData.game_state as string;
    return {
      eventType: `dota2.${gameState ?? "unknown"}`,
      isMatchStart: gameState === "DOTA_GAMERULES_STATE_PRE_GAME",
      isMatchEnd: gameState === "DOTA_GAMERULES_STATE_POST_GAME",
      platform: "dota2",
    };
  }

  // CS2 GSI
  if (data.round && data.player && data.map) {
    const mapData = data.map as Record<string, unknown>;
    const phase = mapData.phase as string;
    return {
      eventType: `cs2.${phase ?? "unknown"}`,
      isMatchStart: phase === "warmup",
      isMatchEnd: phase === "gameover",
      platform: "cs2",
    };
  }

  // LoL Live Client Data
  if (data.activePlayer || data.allPlayers) {
    const events = data.events as Record<string, unknown> | undefined;
    const eventsList = (events?.Events ?? []) as Array<Record<string, unknown>>;
    const hasGameEnd = eventsList.some((e) => e.EventName === "GameEnd");
    return {
      eventType: "lol.gamestate",
      isMatchStart: !!(data.activePlayer && !hasGameEnd),
      isMatchEnd: hasGameEnd,
      platform: "lol",
    };
  }

  return { eventType: "unknown", isMatchStart: false, isMatchEnd: false, platform: null };
}

// ── Message handling ─────────────────────────────────────────────────────────

async function handleMessage(ws: WebSocket, raw: string) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  const type = msg.type as string;

  // Auth
  if (type === "auth") {
    const wallet = (msg.wallet as string ?? "").toLowerCase();
    if (!wallet || !wallet.startsWith("0x")) {
      send(ws, { type: "error", message: "Invalid wallet" });
      return;
    }

    const signature = msg.signature as string | undefined;
    const timestamp = msg.timestamp as number | undefined;

    if (!signature || !timestamp) {
      send(ws, { type: "error", message: "signature and timestamp required" });
      return;
    }

    // Replay protection: reject timestamps older than 5 minutes
    const MAX_AUTH_AGE_MS = 5 * 60 * 1000;
    const age = Date.now() - timestamp;
    if (age > MAX_AUTH_AGE_MS || age < -MAX_AUTH_AGE_MS) {
      send(ws, { type: "error", message: "Auth timestamp expired or invalid" });
      return;
    }

    // EIP-191 signature verification
    const authMessage = `LightChallenge WS Auth\nTimestamp: ${timestamp}`;
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(authMessage, signature).toLowerCase();
    } catch {
      send(ws, { type: "error", message: "Invalid signature" });
      return;
    }

    if (recoveredAddress !== wallet) {
      send(ws, { type: "error", message: "Signature does not match wallet" });
      return;
    }

    const client: PlayerClient = {
      ws,
      wallet,
      authenticated: true,
      sessionId: null,
      platform: null,
      eventCount: 0,
    };
    players.set(ws, client);
    send(ws, { type: "auth_ok", wallet });
    log(`player authenticated: ${wallet}`);
    return;
  }

  // GSI event from desktop client
  if (type === "gsi_event") {
    const client = players.get(ws);
    if (!client?.authenticated) {
      send(ws, { type: "error", message: "Not authenticated" });
      return;
    }

    const data = msg.data as Record<string, unknown>;
    if (!data) return;

    const state = detectGameState(data);

    // Auto-start session on match start
    if (state.isMatchStart && !client.sessionId && state.platform) {
      const sessionId = await startSession(client, state.platform);
      send(ws, { type: "session_started", session_id: sessionId, platform: state.platform });
    }

    // Store event
    if (client.sessionId) {
      await storeEvent(client, state.eventType, data);

      // Auto-end session on match end
      if (state.isMatchEnd) {
        // Extract summary from final GSI state
        const summary = extractSummary(data, client.platform ?? "");
        send(ws, { type: "session_ended", session_id: client.sessionId, summary });
        await endSession(client, summary);
      }
    }
    return;
  }

  // Spectator subscribe
  if (type === "subscribe") {
    const compId = msg.competition_id as string;
    if (!compId) {
      send(ws, { type: "error", message: "competition_id required" });
      return;
    }
    let spec = spectators.get(ws);
    if (!spec) {
      spec = { ws, competitionIds: new Set() };
      spectators.set(ws, spec);
    }
    spec.competitionIds.add(compId);
    send(ws, { type: "subscribed", competition_id: compId });
    return;
  }
}

function extractSummary(
  data: Record<string, unknown>,
  platform: string
): Record<string, unknown> {
  if (platform === "dota2") {
    const player = data.player as Record<string, unknown> | undefined;
    const map = data.map as Record<string, unknown> | undefined;
    return {
      kills: player?.kills ?? 0,
      deaths: player?.deaths ?? 0,
      assists: player?.assists ?? 0,
      hero: (player?.hero as string) ?? "unknown",
      win: map?.win_team === (player?.team_name ?? ""),
      duration: map?.clock_time ?? 0,
    };
  }
  if (platform === "cs2") {
    const player = data.player as Record<string, unknown> | undefined;
    const state = player?.state as Record<string, unknown> | undefined;
    const matchStats = player?.match_stats as Record<string, unknown> | undefined;
    return {
      kills: matchStats?.kills ?? state?.kills ?? 0,
      deaths: matchStats?.deaths ?? state?.deaths ?? 0,
      assists: matchStats?.assists ?? state?.assists ?? 0,
      mvps: matchStats?.mvps ?? 0,
      score: matchStats?.score ?? 0,
    };
  }
  return {};
}

// ── Broadcast to spectators ──────────────────────────────────────────────────

/**
 * Broadcast a bracket update to all spectators subscribed to a competition.
 * Called externally via HTTP POST /notify (internal-only endpoint).
 */
function broadcastBracketUpdate(competitionId: string, matchData: unknown) {
  for (const [, spec] of spectators) {
    if (spec.competitionIds.has(competitionId)) {
      send(spec.ws, {
        type: "bracket_update",
        competition_id: competitionId,
        match: matchData,
      });
    }
  }
}

// ── Server ───────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  log(`client connected (${wss.clients.size} total)`);

  ws.on("message", (raw) => {
    handleMessage(ws, raw.toString()).catch((err) => {
      log(`message error: ${err?.message}`);
      send(ws, { type: "error", message: "Internal error" });
    });
  });

  ws.on("close", async () => {
    // Clean up player session
    const client = players.get(ws);
    if (client?.sessionId) {
      await endSession(client, { disconnected: true }).catch(() => {});
    }
    players.delete(ws);
    spectators.delete(ws);
    log(`client disconnected (${wss.clients.size} total)`);
  });

  // Heartbeat
  ws.on("pong", () => {});
});

// Heartbeat interval
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  });
}, 30000);

// ── Internal HTTP endpoint for bracket notifications ─────────────────────────
// This allows the match result API route to push updates to spectators.

import http from "http";

const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/notify") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { competition_id, match } = JSON.parse(body);
        if (competition_id) {
          broadcastBracketUpdate(competition_id, match);
        }
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end("bad request");
      }
    });
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

const HTTP_PORT = PORT + 1; // Internal HTTP on port 3101
httpServer.listen(HTTP_PORT);

log(`WebSocket gateway started on ws://0.0.0.0:${PORT}`);
log(`Internal HTTP notify on http://0.0.0.0:${HTTP_PORT}/notify`);

// ── Shutdown ─────────────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  log("SIGTERM — shutting down");
  clearInterval(heartbeat);
  wss.close();
  httpServer.close();
  pool.end().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  log("SIGINT — shutting down");
  clearInterval(heartbeat);
  wss.close();
  httpServer.close();
  pool.end().then(() => process.exit(0));
});
