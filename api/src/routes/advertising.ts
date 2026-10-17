/**
 * /api/advertising — composed from focused sub-routers mounted at "/", so
 * every path is unchanged and app.ts still imports `advertisingRoutes`.
 *
 *   advertising/boosts.ts      job boosts
 *   advertising/campaigns.ts   campaigns, ad sets, targeting reach estimate
 *   advertising/ads.ts         ad creatives
 *   advertising/insights.ts    stats + analytics dashboard
 *   advertising/enrichment.ts  enrichment credits
 *   advertising/serve.ts       first-party slot serve (#2396)
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { advertisingBoostRoutes } from "./advertising/boosts.js";
import { advertisingCampaignRoutes } from "./advertising/campaigns.js";
import { advertisingAdRoutes } from "./advertising/ads.js";
import { advertisingInsightRoutes } from "./advertising/insights.js";
import { advertisingEnrichmentRoutes } from "./advertising/enrichment.js";
import { advertisingServeRoutes } from "./advertising/serve.js";

export const advertisingRoutes = new Hono<AppEnv>();

advertisingRoutes.route("/", advertisingBoostRoutes);
advertisingRoutes.route("/", advertisingCampaignRoutes);
advertisingRoutes.route("/", advertisingAdRoutes);
advertisingRoutes.route("/", advertisingInsightRoutes);
advertisingRoutes.route("/", advertisingEnrichmentRoutes);
advertisingRoutes.route("/", advertisingServeRoutes);
