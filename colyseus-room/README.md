# Colyseus multiplayer server for 3D World

Authoritative-server multiplayer for hired.video's 3D game studio. Deploys as a stand-alone Node process — **Workers can't host persistent WebSocket sessions** so this lives outside the `api/` Cloudflare Workers bundle.

Gap-register entry: **#1636** (3D world Phase 3).

## Architecture

- **Transport**: WebSocket via `@colyseus/ws-transport`.
- **Room**: `World3DRoom` (one room per `studioProject.id`). State includes per-player position/rotation + a mirror of the world's challenge progress.
- **State sync**: server tick 20Hz; clients reconcile authoritative positions, send input commands.
- **Auth**: clients pass a short-lived join token issued by the Workers API (`POST /api/games/:projectId/multiplayer/token`). Token encodes `{ userId, projectId, exp }` signed with a shared secret.

## Deploy targets

| Host | Cost | Notes |
|---|---|---|
| Fly.io | ~$3-5/mo per region | Easy `flyctl deploy`; tag with the project's region preference |
| Railway | $5/mo free | Auto-scales; simplest CI |
| Hetzner CX11 | €4.51/mo | Cheapest, manual upgrades |

Pick one before merging Phase 3. The frontend hook reads `VITE_GAME_REALTIME_URL` — when unset, the editor falls back to single-player mode.

## Local dev

```bash
cd colyseus-room
npm install
npm run dev
# Server listens on :2567 by default
```

Then in the frontend:

```bash
export VITE_GAME_REALTIME_URL=ws://localhost:2567
npm run dev
```

## Files

- `src/server.ts` — entrypoint; mounts the room handler + health check.
- `src/World3DRoom.ts` — the Colyseus Room subclass (state schema + tick + message handlers).
- `src/auth.ts` — JWT verification for the join-token issued by the Workers API.

## Not yet wired

- Region pinning / latency-aware room placement (deferred — single-region first).
- Recording + replay (deferred — would feed the gamification fraud system).
- Spectator mode (deferred).
- Reconciliation tuning for high-jitter mobile networks (revisit after first deploy telemetry).

These belong to **gap #1636** in the consolidated register.
