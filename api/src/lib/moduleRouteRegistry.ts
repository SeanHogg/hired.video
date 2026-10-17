/**
 * Maps API path-prefix → module slug. When the admin toggles a slug off via
 * /api/admin/sa/modules, every request to the matching prefix will
 * return 403 MODULE_DISABLED (enforced by moduleGateByPath in app.ts).
 *
 * Slugs follow the module's DB slug column. If a slug isn't present in the
 * modules table the gate is a no-op (opt-in enforcement).
 *
 * Admin / SuperAdmin roles bypass the gate so support can still investigate
 * a disabled module.
 */
export const MODULE_ROUTE_REGISTRY: Record<string, string> = {
  "/api/ads": "ads",
  "/api/advertising": "advertising",
  "/api/affiliates": "affiliates",
  "/api/ai": "ai",
  // The AI tool dispatcher has its own toggle (per-tool module slugs —
  // resume-scorer, resume-optimizer, value-proposition, career — are checked
  // by the dispatcher from services/ai-tools/registry.ts).
  "/api/ai/tools": "ai-tools",
  "/api/ats": "ats",
  "/api/assessments": "assessments",
  "/api/auto-apply": "auto-apply",
  "/api/boards": "exclusive-boards",
  "/api/calendar": "calendar",
  "/api/career": "career",
  "/api/community": "community",
  "/api/creators": "creators",
  "/api/feed": "feed",
  "/api/followups": "followups",
  "/api/hubs": "hubs",
  "/api/interview": "interview",
  "/api/people": "people-ops",
  "/api/studio": "video-studio",
};
