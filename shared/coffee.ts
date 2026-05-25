/**
 * "Grab a Coffee" — shared types for the proposal/accept flow.
 *
 * Lifecycle:
 *   1. Requester opens a recipient's /people/[id] profile and clicks
 *      "Grab a coffee" (CTA is gated by recipient's `openToCoffee`
 *      profile section visibility — see shared/profile-sections.ts).
 *   2. POST /api/coffee → coffee_requests row, status='pending', notifies
 *      recipient.
 *   3. Recipient accepts or declines via PATCH /api/coffee/:id. Accept
 *      creates: scheduled_events row (type='coffee'), two event_attendees,
 *      a shared task across both users (see project_globe_details_owner_only
 *      for the discovery side and project_studio_workspaces for the
 *      transactional pattern).
 *
 * Imported by backend (services/coffee/*, routes/coffee.ts) and frontend
 * (PeopleDetail Grab-a-coffee button, Coffee tab on Tasks/Events page,
 * map "Open to coffee" pins).
 */
import { z } from "zod";

export const COFFEE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
] as const;
export type CoffeeStatus = (typeof COFFEE_STATUSES)[number];

export const COFFEE_FORMATS = ["in_person", "remote"] as const;
export type CoffeeFormat = (typeof COFFEE_FORMATS)[number];

export const CreateCoffeeRequestSchema = z.object({
  recipientUserId: z.string().uuid(),
  message: z.string().max(2000).optional(),
  proposedAt: z.string().datetime().optional(),
  proposedLocation: z.string().max(500).optional(),
  proposedFormat: z.enum(COFFEE_FORMATS).default("in_person"),
  // Auto-expire if not responded to in this many days (default 14).
  expiresInDays: z.number().int().min(1).max(60).default(14),
});
export type CreateCoffeeRequestInput = z.infer<typeof CreateCoffeeRequestSchema>;

export const RespondCoffeeRequestSchema = z.object({
  action: z.enum(["accept", "decline"]),
  responseMessage: z.string().max(2000).optional(),
  // On accept the recipient can confirm or revise the meeting details.
  confirmedAt: z.string().datetime().optional(),
  confirmedLocation: z.string().max(500).optional(),
  confirmedFormat: z.enum(COFFEE_FORMATS).optional(),
});
export type RespondCoffeeRequestInput = z.infer<typeof RespondCoffeeRequestSchema>;

export interface ResolvedCoffeeRequest {
  id: string;
  requesterUserId: string;
  recipientUserId: string;
  requesterName: string | null;
  recipientName: string | null;
  requesterAvatarUrl: string | null;
  recipientAvatarUrl: string | null;
  message: string | null;
  proposedAt: string | null;
  proposedLocation: string | null;
  proposedFormat: CoffeeFormat;
  status: CoffeeStatus;
  respondedAt: string | null;
  responseMessage: string | null;
  acceptedEventId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Viewer-relative role: 'requester' | 'recipient' | 'observer'.
  viewerRole?: "requester" | "recipient" | "observer";
}

/**
 * Default friendly title for the shared task created when a coffee
 * request is accepted. Lives in shared so backend (task creation) and
 * frontend (offline preview) produce the same text.
 */
export function defaultCoffeeTaskTitle(
  requesterName: string | null,
  recipientName: string | null,
): string {
  const a = requesterName?.trim() || "Coffee buddy";
  const b = recipientName?.trim() || "Coffee buddy";
  return `Grab coffee: ${a} ↔ ${b}`;
}
