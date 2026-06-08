/**
 * Public (unauthenticated) campaign endpoint — the open-tracking pixel, hit
 * straight from a recipient's email client (no JWT). Mounted at /api/campaigns
 * and listed in PUBLIC_PREFIXES (app.ts).
 *
 * Unsubscribe + preference management moved to /api/email (email-preferences.ts)
 * — they're consent-ledger concerns shared with nurture drips, not campaign-
 * specific.
 *
 *   GET /api/campaigns/open/:recipientId.png  — open-tracking pixel
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { CampaignService } from "../services/campaigns/CampaignService.js";

export const campaignsPublicRoutes = new Hono<AppEnv>();

// 1×1 transparent GIF.
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

campaignsPublicRoutes.get("/open/:pixel", async (c) => {
  // :pixel is "<recipientId>.png" — strip the extension.
  const recipientId = c.req.param("pixel").replace(/\.(png|gif)$/i, "");
  if (recipientId) {
    await CampaignService.create(getDb()).markOpened(recipientId);
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
