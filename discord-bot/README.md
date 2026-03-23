# LightChallenge Discord Bot

Tournament notification bot for LightChallenge competitions. Sends match notifications, bracket updates, and result announcements to Discord channels linked to competitions.

## Setup

### 1. Discord Application Setup

Application ID: `1485603577769623643`

1. Go to [discord.com/developers/applications/1485603577769623643](https://discord.com/developers/applications/1485603577769623643)
2. **General**: Set name to "LightChallenge", upload `icon.png` as the app icon
3. **Bot** tab: Click **Reset Token** to get your bot token, save it as `DISCORD_TOKEN`
4. **Bot** tab: Under **Privileged Gateway Intents**, enable **Message Content Intent**
5. **Bot** tab: Ensure **PUBLIC BOT** is toggled ON (so users can invite it)

### 2. Invite the Bot

Use this URL to invite the bot to your Discord server:

```
https://discord.com/api/oauth2/authorize?client_id=1485603577769623643&permissions=2147485696&scope=bot%20applications.commands
```

Permissions included:
- Send Messages
- Embed Links
- Use Slash Commands

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token from the Discord developer portal |
| `DISCORD_CLIENT_ID` | Application ID from the Discord developer portal |
| `DATABASE_URL` | PostgreSQL connection string (same DB as the main app) |
| `BOT_WEBHOOK_PORT` | Port for the internal HTTP webhook server (default: 3200) |

### 4. Install and Run

```bash
npm install

# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/bracket <competition_id>` | Display the current bracket state |
| `/standings <competition_id>` | Show current standings |
| `/link-channel <competition_id>` | Link this channel to a competition for auto-notifications (requires Manage Channels) |

## Webhook Notifications

The bot runs an HTTP server (default port 3200) that accepts POST notifications from the main app. Send a JSON payload to trigger notifications in linked Discord channels.

### Notification Types

**match.completed** -- Match result announcement (flat format from main app)
```json
{
  "type": "match.completed",
  "competition_id": "uuid",
  "match_id": "uuid",
  "winner": "0x...",
  "score_a": 3,
  "score_b": 1
}
```

**competition.started** -- Competition start with initial bracket
```json
{
  "type": "competition.started",
  "competition_id": "uuid"
}
```

**competition.completed** -- Final results and winner
```json
{
  "type": "competition.completed",
  "competition_id": "uuid",
  "winner": "0x..."
}
```

**match.upcoming** -- Match ready notification
```json
{
  "type": "match.upcoming",
  "competition_id": "uuid",
  "match": {
    "participant_a": "0x...",
    "participant_b": "0x...",
    "round": 2,
    "match_number": 1,
    "bracket_type": "winners",
    "scheduled_at": "2026-03-25T18:00:00Z"
  }
}
```

### Health Check

```bash
curl http://localhost:3200/health
```
