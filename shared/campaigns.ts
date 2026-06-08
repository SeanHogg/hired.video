/**
 * Email-campaign SSoT — shared by the API (campaign engine, routes) and the
 * frontend (composer, list, admin manager). Owning the status enum, the
 * audience discriminated union, and the wire DTOs here is the only thing that
 * stops the two halves from drifting (the old numeric `EmailCampaignStatus`
 * enum in frontend/types/communication.ts never matched the string statuses
 * the DB actually stores — see gap register).
 *
 * One engine drives every surface:
 *   • Outreach (user-facing) campaigns — reuse the composer + list.
 *   • SuperAdmin marketing campaigns — same components, sender pinned to the
 *     hired.video platform company.
 */
import { z } from "zod";
import { USER_ROLES, type UserRole } from "./user-roles.js";

// ─── Status ──────────────────────────────────────────────────────────────
// String statuses, matching the `email_campaigns.status` column. `draft` is
// editable; `scheduled` is claimed by the cron once `scheduledAt` is due;
// `sending` is mid-flight (recipients draining); `sent` is terminal-success;
// `paused`/`cancelled` are terminal-stop.
export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "paused",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  paused: "Paused",
  cancelled: "Cancelled",
};

/** A draft can be scheduled/sent; a paused campaign can be resumed. Anything
 *  already sending/sent/cancelled is not (re)sendable from the UI. */
export function isSchedulable(status: CampaignStatus): boolean {
  return status === "draft" || status === "paused";
}

// ─── Per-recipient delivery status ─────────────────────────────────────────
export const RECIPIENT_STATUSES = [
  "pending",
  "sent",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "suppressed",
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

// ─── Audience model ─────────────────────────────────────────────────────────
// Discriminated union, resolved to a concrete recipient list at send time.
//  • role  — platform users filtered by USER_ROLE (+ active-only by default)
//  • leads — rows in marketing_leads (landing captures, contact inquiries)
//  • list  — an explicit pasted/uploaded set of addresses
const ROLE_VALUES = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.EMPLOYEE,
] as const;

/** The roles a campaign audience can target — narrower than UserRole (no
 *  admin/super_admin). Use this in audience UI so the toggle set can't drift
 *  from RoleAudienceSchema. */
export type CampaignAudienceRole = (typeof ROLE_VALUES)[number];

export const RoleAudienceSchema = z.object({
  kind: z.literal("role"),
  roles: z.array(z.enum(ROLE_VALUES)).min(1),
  /** Include suspended/inactive users. Default false — marketing should not
   *  hit deactivated accounts unless explicitly asked. */
  includeInactive: z.boolean().optional().default(false),
});

export const LeadsAudienceSchema = z.object({
  kind: z.literal("leads"),
  /** Optional `source LIKE '<prefix>%'` filter (e.g. "contact_panel"). */
  sourcePrefix: z.string().max(100).optional(),
  /** Optional triage-status filter (e.g. "new"). */
  status: z.string().max(50).optional(),
});

export const ListAudienceSchema = z.object({
  kind: z.literal("list"),
  recipients: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().max(255).optional(),
      }),
    )
    .min(1)
    .max(50000),
});

export const CampaignAudienceSchema = z.discriminatedUnion("kind", [
  RoleAudienceSchema,
  LeadsAudienceSchema,
  ListAudienceSchema,
]);
export type CampaignAudience = z.infer<typeof CampaignAudienceSchema>;
export type RoleAudience = z.infer<typeof RoleAudienceSchema>;

export const AUDIENCE_KIND_LABELS: Record<CampaignAudience["kind"], string> = {
  role: "Platform users by role",
  leads: "Marketing leads",
  list: "Explicit email list",
};

/** Human one-liner describing who a campaign targets — used in list rows. */
export function describeAudience(a: CampaignAudience | null | undefined): string {
  if (!a) return "No audience";
  switch (a.kind) {
    case "role":
      return `Users: ${a.roles.join(", ")}`;
    case "leads":
      return a.sourcePrefix ? `Leads (${a.sourcePrefix})` : "All marketing leads";
    case "list":
      return `${a.recipients.length} explicit recipient${a.recipients.length === 1 ? "" : "s"}`;
  }
}

// ─── Create / update wire schemas ───────────────────────────────────────────
// `body`/`templateId`: a campaign renders from an attached template OR inline
// html — at least one must resolve to content at send time (validated in the
// service, not here, so a draft can be saved before content is finalised).
export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  description: z.string().max(1000).optional(),
  templateId: z.string().uuid().nullable().optional(),
  htmlBody: z.string().optional(),
  fromName: z.string().max(255).optional(),
  audience: CampaignAudienceSchema.optional(),
  /** ISO timestamp. Present + status `scheduled` ⇒ cron sends when due. */
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CreateCampaignSchema.partial();
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

export const ScheduleCampaignSchema = z.object({
  /** Omit / null ⇒ send as soon as the next cron tick claims it. */
  scheduledAt: z.string().datetime().nullable().optional(),
});

// ─── Template wire schemas ──────────────────────────────────────────────────
export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export const UpdateTemplateSchema = CreateTemplateSchema.partial();

// ─── DTOs (read shape) ──────────────────────────────────────────────────────
export interface CampaignRecipientStats {
  total: number;
  sent: number;
  opened: number;
  clicked: number;
  failed: number;
  pending: number;
}

export interface CampaignDTO {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  templateId: string | null;
  status: CampaignStatus;
  audience: CampaignAudience | null;
  fromName: string | null;
  senderCompanyId: string | null;
  createdByUserId: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: CampaignRecipientStats;
}

export interface CampaignTemplateDTO {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string | null;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Audience-size preview returned by the dry-run resolve endpoint — lets the
 *  composer show "≈ N recipients" before committing a send. */
export interface AudiencePreview {
  count: number;
  sample: { email: string; name?: string }[];
}

// ─── Template variable substitution (shared so preview == send) ─────────────
// `{{name}}`, `{{company}}`, `{{email}}` plus any key in the per-recipient
// personalization map. Unknown tokens collapse to empty string.
export function renderTemplateBody(
  body: string,
  vars: Record<string, string | undefined>,
): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

export type CampaignUserRole = UserRole;
