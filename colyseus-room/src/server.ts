/**
 * Colyseus multiplayer server entrypoint (gap #1636 Phase 3).
 *
 * Deploy this as a stand-alone Node process — see [README.md](../README.md)
 * for host options (Fly.io / Railway / Hetzner). The Cloudflare Workers
 * API at [../api](../../api) is a separate deploy that issues short-
 * lived join tokens to clients via `POST /api/games/:projectId/multiplayer/token`
 * (route TBD when this server gets a permanent host).
 *
 * Single room handler today; one Room per project id.
 */

import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import { World3DRoom } from "./World3DRoom.js";

const PORT = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  // Lightweight health probe so Fly.io / Railway health checks pass.
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok\n");
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("world_3d", World3DRoom);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[colyseus] listening on :${PORT}`);
});
