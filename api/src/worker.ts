import { createApp } from "./app.js";

const app = createApp();

// Cloudflare Workers expects a default export.
// Hono apps are callable and expose a `fetch` method, so exporting the app works.
export default app;
