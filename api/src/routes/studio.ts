/**
 * Studio routes, mounted at /api/studio (W2-3a split of the former
 * 4.5k-line god route). Each concern is a sub-router under routes/studio/,
 * layered route → use case (services/studio/*) → repository. This barrel
 * composes them IN ORDER so a static path always registers before a
 * `:param` path that shares its prefix:
 *   generation (storyboard / comic / page / images) → page embeds →
 *   project drafts + upload → project reads → project writes → subjects →
 *   analytics → public namespace → video rails → brand kits → campaigns.
 *
 * Other routers also mount at /api/studio (studio-features, studio-templates,
 * social publish, render variants, …) — see app.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { studioStoryboardRoutes } from "./studio/storyboard.js";
import { studioGenerationRoutes } from "./studio/generation.js";
import { studioImageRoutes } from "./studio/images.js";
import { studioPageEmbedRoutes } from "./studio/page-embeds.js";
import { studioProjectDraftRoutes } from "./studio/project-drafts.js";
import { studioProjectReadRoutes } from "./studio/projects-read.js";
import { studioProjectWriteRoutes } from "./studio/projects-write.js";
import { studioProjectSubjectRoutes } from "./studio/project-subjects.js";
import { studioProjectAnalyticsRoutes } from "./studio/project-analytics.js";
import { studioPublicRoutes } from "./studio/public.js";
import { studioVideoRoutes } from "./studio/videos.js";
import { studioBrandKitRoutes } from "./studio/brand-kits.js";
import { studioCampaignRoutes } from "./studio/campaigns.js";

export { detectExplicitSceneCount } from "../services/studio/storyboard-prompts.js";

export const studioRoutes = new Hono<AppEnv>();

studioRoutes.route("/", studioStoryboardRoutes);
studioRoutes.route("/", studioGenerationRoutes);
studioRoutes.route("/", studioImageRoutes);
studioRoutes.route("/", studioPageEmbedRoutes);
studioRoutes.route("/", studioProjectDraftRoutes);
studioRoutes.route("/", studioProjectReadRoutes);
studioRoutes.route("/", studioProjectWriteRoutes);
studioRoutes.route("/", studioProjectSubjectRoutes);
studioRoutes.route("/", studioProjectAnalyticsRoutes);
studioRoutes.route("/", studioPublicRoutes);
studioRoutes.route("/", studioVideoRoutes);
studioRoutes.route("/", studioBrandKitRoutes);
studioRoutes.route("/", studioCampaignRoutes);
