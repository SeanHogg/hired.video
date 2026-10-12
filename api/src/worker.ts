import { createApp } from "./app.js";
// Evaluate the hot route modules at isolate startup, not in a request (#2342).
import "./hot-routes.js";
// Real-time chat transport (gap #1230). Cloudflare needs the Durable
// Object class to be re-exported from the worker module so the runtime
// can construct instances. The binding name in wrangler.toml is
// CHAT_ROOM → class_name = "ChatRoom".
export { ChatRoom } from "./durable/ChatRoom.js";
// 3D world multiplayer signaling (gap #1636). Binding name in
// wrangler.toml is GAME_ROOM → class_name = "GameSignalingRoom".
export { GameSignalingRoom } from "./durable/GameSignalingRoom.js";
// Real-time collaborative studio editing (gap #2243). Binding name in
// wrangler.toml is STUDIO_ROOM → class_name = "StudioRoom".
export { StudioRoom } from "./durable/StudioRoom.js";

// NOTE: `wrangler dev` will inject env vars via `wrangler.toml` or your shell.
// This file intentionally avoids bundling `dotenv` to keep the worker bundle small.
// Ensure DATABASE_URL, NEON_DATABASE_URL, or NEON_DB_URL is set in your environment.

const app = createApp();

// Cloudflare Workers (module format) provide bindings via the `env` argument.
// Some libraries (like Hono) don't expose `env` everywhere, so we store it in a
// global shortcut for any runtime helper to access.

/** How long a colo keeps its edge copy of a CDN object (see deleteR2Keys). */
const CDN_EDGE_TTL_SECONDS = 86_400;

/** Serve R2 objects for cdn.hired.video requests. */
async function handleCdnRequest(request: Request, env: any, ctx: any): Promise<Response> {
  const url = new URL(request.url);
  const key = url.pathname.slice(1); // strip leading /

  if (!key) {
    return new Response("Not Found", { status: 404 });
  }

  const bucket: R2Bucket | undefined = env.VIDEO_BUCKET;
  if (!bucket) {
    return new Response("Storage not configured", { status: 503 });
  }

  if (request.method === "HEAD") {
    const head = await bucket.head(key);
    if (!head) return new Response(null, { status: 404 });
    return new Response(null, {
      headers: {
        "Content-Type": head.httpMetadata?.contentType ?? "application/octet-stream",
        "Content-Length": String(head.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Every upload path writes a unique key (UUID / content hash) and objects
  // are served `immutable`, so the colo edge cache can answer repeats
  // without an R2 read. The edge copy is stored with a shorter TTL than the
  // client header so a deleted object (purged in-colo by deleteR2Keys)
  // also ages out of other colos. Range requests bypass the put (a partial
  // body must not be stored as the full object) but can still be served
  // from a cached full response by `match`.
  const edgeCache: Cache | undefined = (globalThis as any).caches?.default;
  if (edgeCache) {
    const hit = await edgeCache.match(request);
    if (hit) return hit;
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  const response = new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "ETag": object.etag,
    },
  });
  if (edgeCache && !request.headers.has("Range")) {
    const edgeCopy = new Response(response.clone().body, response);
    edgeCopy.headers.set("Cache-Control", `public, max-age=${CDN_EDGE_TTL_SECONDS}`);
    ctx?.waitUntil(edgeCache.put(request, edgeCopy).catch(() => undefined));
  }
  return response;
}

function isCdnRequest(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "cdn.hired.video";
}

export default {
  async fetch(request: Request, env: any, ctx: any) {
    (globalThis as any).__ENV = env;

    // CDN requests go straight to R2 — no Hono routing needed
    if (isCdnRequest(request)) {
      return handleCdnRequest(request, env, ctx);
    }

    return app.fetch(request, env, ctx);
  },

  // Cloudflare Cron Trigger — configure in wrangler.toml:
  //   [[triggers]]
  //   crons = ["*/5 * * * *"]
  async scheduled(event: any, env: any, ctx: any) {
    (globalThis as any).__ENV = env;
    // Imported on demand so the cron fan-out's services don't load at isolate
    // start (Worker startup CPU cap, gap #2339).
    ctx.waitUntil(import("./scheduled.js").then((m) => m.runScheduled()));
  },
};
