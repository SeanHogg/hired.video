/**
 * Public (unauthenticated) campaign endpoints — reached straight from a
 * recipient's email client, so no JWT. Mounted at /api/campaigns and listed in
 * PUBLIC_PREFIXES (app.ts).
 *
 *   GET /api/campaigns/unsubscribe?e=&c=&t=   — one-click unsubscribe (HMAC)
 *   GET /api/campaigns/open/:recipientId.png  — open-tracking pixel
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { CampaignService } from "../services/campaigns/CampaignService.js";

export const campaignsPublicRoutes = new Hono<AppEnv>();

function buildService(): CampaignService {
  const db = getDb();
  return new CampaignService(buildRepos(db).campaigns as any, db);
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;margin:0;padding:0;">
  <div style="max-width:480px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <h1 style="font-size:20px;color:#18181b;margin:0 0 12px;">${title}</h1>
    <p style="color:#52525b;line-height:1.6;margin:0;">${body}</p>
  </div>
</body></html>`;
}

// 1×1 transparent GIF.
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

campaignsPublicRoutes.get("/unsubscribe", async (c) => {
  const url = new URL(c.req.url);
  const e = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const campaignId = url.searchParams.get("c");
  let email = "";
  try {
    email = Buffer.from(e, "base64url").toString("utf-8");
  } catch {
    email = "";
  }
  if (!email || !token) {
    return c.html(page("Invalid link", "This unsubscribe link is malformed."), 400);
  }
  const ok = await buildService().unsubscribe(email, token, campaignId);
  if (!ok) {
    return c.html(page("Invalid link", "This unsubscribe link could not be verified."), 400);
  }
  return c.html(
    page(
      "You're unsubscribed",
      `<strong>${email}</strong> has been removed from hired.video marketing emails. You'll still receive essential account notifications.`,
    ),
    200,
  );
});

campaignsPublicRoutes.get("/open/:pixel", async (c) => {
  // :pixel is "<recipientId>.png" — strip the extension.
  const recipientId = c.req.param("pixel").replace(/\.(png|gif)$/i, "");
  if (recipientId) {
    await buildService().markOpened(recipientId);
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
});

export default campaignsPublicRoutes;
