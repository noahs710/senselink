# SenseLink

A polished Discord bot for [PeakSense](https://github.com/nousresearch/peaksense) that surfaces the entire public API through rich embeds, buttons, dropdowns, and slash commands. Built to run for free on [Railway](https://railway.app/).

## What it can do

- **Profiles** — `/profile <handle>` shows a public profile card with stats, recent achievements, and action buttons for dabs, achievements, and compare.
- **Dabs** — `/dab <id>` previews any dab with score, grade, temp, duration, likes, and a direct PeakSense link.
- **Leaderboards** — `/leaderboard [period]` ranks dabbers by ELO. Switch between all-time, month, and week with a dropdown.
- **Feed** — `/feed [period]` shows recent or trending public dabs from the community.
- **Compare** — `/compare <h1> <h2>` puts two users head-to-head.
- **Share URLs** — `/share profile <handle>` or `/share dab <id>` returns the public share link.
- **Status** — `/status` checks PeakSense API health and bot latency.
- **Help** — `/senselink` shows the full command list and invite link.

## Public API endpoints used

The bot is read-only and uses every anonymous-friendly PeakSense endpoint:

- `GET /api/health`
- `GET /api/feed`
- `GET /api/leaderboard`
- `GET /api/users/:handle`
- `GET /api/users/:handle/dabs`
- `GET /api/users/:handle/stats`
- `GET /api/users/:handle/achievements`
- `GET /api/dabs/:id`
- `GET /api/dabs/:id/likes`

## Setup guide

### 1. Create a Discord bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** and give it a name (e.g. `SenseLink`)
3. Open the **Bot** tab on the left
4. Click **Reset Token** and copy the token — this is `DISCORD_TOKEN`
5. In the **OAuth2** tab, copy the **Client ID** — this is `DISCORD_CLIENT_ID`
6. Under **OAuth2 → URL Generator**, select:
   - `bot`
   - `applications.commands`
   - No special permissions are needed (the bot only sends messages and uses slash commands)
7. Copy the generated URL and use it to invite the bot to your server

### 2. Configure environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
PEAKSENSE_API_BASE=https://peaksense.fly.dev
# optional — comma-separated test server IDs for instant command registration
GUILD_IDS=1234567890123456789
```

### 3. Install and register slash commands

```bash
npm install
npm run register
npm run dev
```

`npm run register` publishes the slash commands to Discord. If `GUILD_IDS` is set, commands appear immediately in those servers. If empty, commands are registered globally and can take up to an hour to show everywhere.

`npm run dev` starts the bot with Node’s file watcher so changes auto-reload.

### 4. Verify it works

In Discord, type:

```
/senselink
/status
/leaderboard
```

If the API is reachable and commands are registered, you’ll see rich embeds.

## Production hosting

### Railway (recommended free tier)

1. Push this folder to a GitHub repository.
2. Go to https://railway.app/ and click **New Project** → **Deploy from GitHub repo**.
3. Select the SenseLink repo.
4. In **Variables**, add:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `PEAKSENSE_API_BASE`
   - `NODE_ENV=production`
   - `GUILD_IDS` (optional; leave empty for global commands)
5. Railway detects `package.json` and runs `npm start` automatically.

No `Dockerfile`, `Procfile`, or `railway.json` is needed.

### Other free hosts

- **Render**: use the Web Service template, set the env vars, and use `npm start` as the start command.
- **Fly.io**: `fly launch` and set secrets with `fly secrets set`.
- **Self-host**: any machine with Node 18+ and the env vars set.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | yes | — | Bot token from Discord portal |
| `DISCORD_CLIENT_ID` | yes | — | OAuth2 client ID |
| `PEAKSENSE_API_BASE` | yes | `http://127.0.0.1:8081` | PeakSense API origin |
| `GUILD_IDS` | no | — | Comma-separated dev server IDs for instant command registration |
| `NODE_ENV` | no | `development` | `production` disables dev-only logs |

## Project structure

```
src/
  index.js              # bot entry point + interaction router
  deploy-commands.js    # slash-command registration
  client.js             # PeakSense API HTTP client
  formatters.js         # Discord embed builders
  components.js         # buttons, dropdowns, component handler
  commands/index.js     # slash command definitions + handlers
```

## Useful commands

| npm script | What it does |
|---|---|
| `npm start` | Start the bot |
| `npm run dev` | Start with file watcher |
| `npm run register` | Register slash commands |
| `npm run lint` | Lint with ESLint |

## License

MIT
