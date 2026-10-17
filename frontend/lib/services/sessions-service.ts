/**
 * Sessions service — wraps the /api/auth/oauth/sessions endpoints (routes/oauth.ts).
 *
 * Single source of truth for session ops on the FE. Both the user-facing
 * /security/sessions page AND the SuperAdmin "view this user's sessions"
 * surface call through here so the request/response shape can't drift.
 *
 * The backend (see migration 0060) tracks per-device sessions with
 * sliding 14-day idle timeout, 30-day absolute expiry, and a 3-device
 * cap. A session row's `current` flag is true when its id matches the
 * `sid` claim of the JWT making the request — the SessionRow component
 * uses this to disable its own revoke button rather than taking a
 * `canRevoke` prop from a parent.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

export const SessionSchema = z.object({
  id: z.string(),
  deviceLabel: z.string().nullable(),
  ipAddress: z.string().nullable(),
  ipCountry: z.string().nullable(),
  trusted: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
});

export type SessionRow = z.infer<typeof SessionSchema>;

export const SessionsListSchema = z.array(SessionSchema);

export const sessionsService = {
  /** List the caller's active sessions, oldest-first. */
  async list(): Promise<SessionRow[]> {
    const res = await apiClient.get<SessionRow[]>("/api/auth/oauth/sessions", SessionsListSchema);
    return res.data;
  },

  /** Revoke a specific device. Backend rejects with 404 if the id
   *  doesn't belong to the caller — caller doesn't need to scope. */
  async revoke(id: string): Promise<void> {
    await apiClient.delete(`/api/auth/oauth/sessions/${encodeURIComponent(id)}`);
  },

  /** Revoke every session except the caller's current one. */
  async revokeAllOthers(): Promise<void> {
    await apiClient.delete("/api/auth/oauth/sessions");
  },
};
