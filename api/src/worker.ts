import { createApp } from "./app.js";

// NOTE: `wrangler dev` will inject env vars via `wrangler.toml` or your shell.
// This file intentionally avoids bundling `dotenv` to keep the worker bundle small.
// Ensure DATABASE_URL or NEON_DATABASE_URL is set in your dev environment.

const app = createApp();

// Cloudflare Workers expects a default export.
// Hono apps are callable and expose a `fetch` method, so exporting the app works.
export default app;
