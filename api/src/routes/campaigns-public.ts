/**
 * Public (unauthenticated) campaign endpoints — hit straight from a recipient's
 * email client (no JWT). Mounted at /api/campaigns and listed in PUBLIC_PREFIXES
 * (app.ts).
 *
 * Unsubscribe + preference management moved to /api/email (email-preferences.ts)
 * — they're consent-ledger concerns shared with nurture drips, not campaign-
 * specific.
 *
 *   GET /api/campaigns/open/:recipientId.png  — open-tracking pixel
 *   GET /api/campaigns/click/:recipientId     — signed click redirect
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { CampaignService } from "../services/campaigns/CampaignService.js";
import {
  isTrackableTarget,
  verifyClickTarget,
} from "../services/campaigns/campaign-links.js";

/** Site root fallback for unsigned/forged click links — keeps the endpoint
 *  from ever being an open redirect to an attacker-supplied target. */

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

// Signed click redirect — outbound campaign-body links are rewritten to point
// here (CampaignService.wrapBody). Records the click then 302s to the target.
// The HMAC over (recipientId, target) makes this safe against open-redirect
// abuse: a target we never signed for this recipient falls back to the site
// root rather than redirecting anywhere an attacker chooses.
campaignsPublicRoutes.get("/click/:recipientId", async (c) => {
  const recipientId = c.req.param("recipientId");
  const target = c.req.query("u") ?? "";
  const signature = c.req.query("s") ?? "";

  const safe =
    recipientId &&
    isTrackableTarget(target) &&
    (await verifyClickTarget(recipientId, target, signature));

  if (!safe) {
    return c.redirect(frontendBaseUrl(), 302);
  }

  await CampaignService.create(getDb()).markClicked(recipientId);
  return c.redirect(target, 302);
});

export default campaignsPublicRoutes;
