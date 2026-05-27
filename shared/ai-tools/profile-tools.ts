import type { AIToolDef } from "./types.js";

/** User profile tools.
 *
 * `/api/users/:id` is the correct path on the current backend (see
 * app.ts:515 — `/api/users` mounts `userRoutes`). The previous frontend
 * registry already had this one correct; the entry is preserved here so
 * the orchestrator does not need to maintain a parallel list.
 */
export const userProfileGet: AIToolDef = {
  id: "user-profile-get",
  description: "Get a user profile by id or slug.",
  endpoint: "/api/users/:id",
  method: "GET",
  requiresAuth: false,
  supportedActions: ["optimize-headline", "improve-summary", "enhance-profile"],
  contextTypes: ["profile-view", "profile-edit", "search"],
  responseSchema: {
    id: "string",
    name: "string",
    headline: "string",
    summary: "string",
    skills: "array",
  },
};
