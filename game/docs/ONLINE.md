# Orbkin Arena — online PvP

The Arena has three modes: **Hotseat** (two players, one device), **vs CPU** (the Ace AI) and
**Online** (two devices, a 4-letter room code). Hotseat and CPU run entirely in the browser.
Online needs the small Node server in `server/`, which runs the same rules engine
(`src/engine`) and is the single source of truth for every battle.

## Run locally

```bash
cd game
npm install
npm run server          # arena server on ws://localhost:8787 (GET http://localhost:8787/health)
npm run dev             # game on http://localhost:5173 — open it in two browser windows
```

In the game: Title → **Arena (PvP)** → **Online** → *Create a room* in one window, type the
code into *Join* in the other. When the page is served by Vite (ports 5173/4173) the client
connects to `ws://<same host>:8787` automatically, so another device on your LAN can join via
`http://<your-ip>:5173` (start Vite with `npm run dev -- --host`).

One-process alternative: `npm run build && npm run server` — the server also serves `dist/`,
so `http://localhost:8787` is the whole game and online play connects back to the same origin.

### Environment variables (server)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `HOST` | all interfaces | bind address |
| `STATIC_DIR` | `../dist` if built | serve the built game from this folder (set to empty to disable) |
| `TURN_SECONDS` | `45` | decision time per turn |

## Pointing the client at a server

Resolution order (`src/net/client.ts → arenaServerUrl`):
1. URL parameter: `?server=wss://arena.example.com` (handy for testing a deploy)
2. Build-time env: `VITE_ARENA_SERVER=wss://arena.example.com npm run build`
3. Vite dev/preview (ports 5173/4173): `ws(s)://<page host>:8787`
4. Otherwise same origin: `ws(s)://<page host>/arena` (the server accepts WebSockets on any path)

If the server can't be reached the lobby says so (with the URL it tried) — hotseat and CPU
keep working.

## Deploy

Any host that runs Node 20+ and allows WebSockets (Fly.io, Render, Railway, a VPS, …):

```bash
npm ci && npm run build      # optional: lets the server serve the game too
PORT=8080 npm run server     # or: npx tsx server/index.ts
```

- Behind TLS (most PaaS), players connect with `wss://`. Make sure the proxy forwards
  WebSocket upgrades; the server sends pings every 25 s, so idle timeouts ≥ 60 s are fine.
- Static game elsewhere (e.g. GitHub Pages / Netlify)? Build it with
  `VITE_ARENA_SERVER=wss://your-arena-host npm run build`.
- Health check: `GET /health` → `{ ok, protocol, rooms, players, uptimeSec }`.
- Rooms live in memory: a restart ends running matches (clients show "Disconnected").
  One process comfortably handles hundreds of rooms; for more, shard by room code.

## Protocol (v1, JSON text frames — `src/net/protocol.ts`)

Client → server: `create {v,name}` · `join {v,code,name}` · `resume {v,code,token}` ·
`team {team}` · `action {step,action}` · `ready {step}` · `rematch` · `newTeams` · `leave` · `ping`.

Server → client: `welcome {code,you,token}` · `room {room}` (per-player snapshot) ·
`start {events,room}` · `turn {step,events,actions,timedOut,room}` · `error {code,message}` ·
`pong` · `closed`.

- **Authoritative:** the server creates the battle with its own random seed, validates teams
  with `validateArenaTeam` and every action with `isLegal`, and runs `resolveTurn`.
- **Hidden commits:** a player's choice is stored server-side; the opponent only learns that
  they *committed*. Both actions are revealed together in the `turn` message.
- **Steps:** every resolved turn/replacement bumps `step`; actions carry the step they are for
  (stale clicks are rejected).
- **Timer:** each decision gets `TURN_SECONDS` plus a playback allowance (cut short once both
  clients report `ready`). On timeout the server picks a random legal move; three timeouts in a
  row forfeit. A forfeit resolves immediately.
- **Reconnect:** `welcome` hands out a 128-bit seat token (kept in `sessionStorage`). On a
  dropped socket the client retries with backoff and sends `resume`; a page reload offers
  *Rejoin room*. The opponent sees "reconnecting…" meanwhile; the timer keeps running.
- **Safety:** hand-written validation of every field, 4 KB message cap, per-connection token
  bucket (burst 30, 10/s), max 24 sockets per IP, rooms swept after 2 min empty / 30 min idle.
