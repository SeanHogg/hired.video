import { createApp } from "./app.js";
import { runScheduled } from "./scheduled.js";
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

/** Serve R2 objects for cdn.hired.video requests. */
async function handleCdnRequest(request: Request, env: any): Promise<Response> {
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

  const object = await bucket.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "ETag": object.etag,
    },
  });
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
      return handleCdnRequest(request, env);
    }

    return app.fetch(request, env, ctx);
  },

  // Cloudflare Cron Trigger — configure in wrangler.toml:
  //   [[triggers]]
  //   crons = ["*/5 * * * *"]
  async scheduled(event: any, env: any, ctx: any) {
    (globalThis as any).__ENV = env;
    ctx.waitUntil(runScheduled());
  },
};
