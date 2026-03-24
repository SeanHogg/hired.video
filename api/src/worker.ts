import { createApp } from "./app.js";
import { seedSuperAdminAndCompany } from "./seed.js";
import { runScheduled } from "./scheduled.js";

// NOTE: `wrangler dev` will inject env vars via `wrangler.toml` or your shell.
// This file intentionally avoids bundling `dotenv` to keep the worker bundle small.
// Ensure DATABASE_URL, NEON_DATABASE_URL, or NEON_DB_URL is set in your environment.

const app = createApp();

// Cloudflare Workers (module format) provide bindings via the `env` argument.
// Some libraries (like Hono) don't expose `env` everywhere, so we store it in a
// global shortcut for any runtime helper to access.

export default {
  async fetch(request: Request, env: any, ctx: any) {
    (globalThis as any).__ENV = env;
    // Seed runs after __ENV is set so getDb() can resolve the database URL from bindings.
    void seedSuperAdminAndCompany().catch((err) => {
      console.error("Failed to seed superadmin/company:", err);
    });
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
