/**
 * ModerationService — single source of truth for the content-abuse
 * reporting workflow. Wraps the existing `content_reports` table with:
 *
 *   • Owner resolution per reportable entity kind (snapshot stored at
 *     report time on `content_reports.entity_owner_id`).
 *   • Admin fan-out notifications when a report lands.
 *   • Inbox thread auto-creation between reporter ↔ admin so the
 *     reporter can answer follow-up questions through /inbox.
 *   • Notification + thread updates when an admin resolves the report.
 *
 * Per the SOLID/DDD layering rule, the route file calls into here; this
 * module never touches Drizzle directly except through repos.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { Repos } from "../../repositories/index.js";
import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportEntityType,
  type ReportReason,
  type ReportStatus,
} from "../../db/schema/reports.js";
import {
  emitNotification,
  resolveActor,
} from "../notifications/notificationService.js";
import { findOrCreateDirectConversation, sendMessage } from "../messaging/messagingService.js";
import { sendModerationFlagEmail } from "../../services/adapters/email/senders/notifications.js";
import { logger } from "../../lib/logger.js";

export type ModerationServiceDeps = {
  repos: Pick<Repos, "users" | "notifications" | "conversations">;
};

const {
  contentReports,
  studioTemplates,
  studioProjects,
  serviceOfferings,
  resumeInformation,
  articles,
  jobItems,
  feedPosts,
  studioVoiceClones,
  communityResources,
  courses,
} = schema;

// ── Errors ──────────────────────────────────────────────────────────────────

export type ModerationErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION_ERROR";

export class ModerationError extends Error {
  constructor(public readonly code: ModerationErrorCode, message: string) {
    super(message);
    this.name = "ModerationError";
  }
}

// ── Owner resolution ───────────────────────────────────────────────────────

/** Resolve the user id that owns a given (entityType, entityId) pair at
 *  the moment of the call. Returns null when the entity has no owner
 *  reference (system articles), when the entity has been deleted, or
 *  when the kind has no resolver yet — callers treat null as "owner
 *  unknown" and the row still stores a null `entity_owner_id`. */
export async function resolveEntityOwner(
  entityType: ReportEntityType,
  entityId: string,
): Promise<string | null> {
  const db = getDb();

  switch (entityType) {
    case "user_profile": {
      // The user_profile entity id is the user id itself — no lookup
      // needed and no row-existence check (the report can target an
      // inactive profile that the moderator still wants to see).
      return entityId;
    }
    case "studio_template": {
      const [row] = await db
        .select({ creatorId: studioTemplates.creatorId })
        .from(studioTemplates)
        .where(eq(studioTemplates.id, entityId))
        .limit(1);
      return row?.creatorId ?? null;
    }
    case "studio_project": {
      const [row] = await db
        .select({ userId: studioProjects.userId })
        .from(studioProjects)
        .where(eq(studioProjects.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "service": {
      // `service_offerings.user_id` is the provider — the
      // `provider_id` column lives on `service_inquiries`, not here.
      const [row] = await db
        .select({ userId: serviceOfferings.userId })
        .from(serviceOfferings)
        .where(eq(serviceOfferings.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "resume": {
      // Resume URLs / share links reference `resume_information.id` —
      // that's the row the user sees and can therefore report.
      const [row] = await db
        .select({ userId: resumeInformation.userId })
        .from(resumeInformation)
        .where(eq(resumeInformation.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "article": {
      const [row] = await db
        .select({ userId: articles.userId })
        .from(articles)
        .where(eq(articles.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "job": {
      const [row] = await db
        .select({ postedByUserId: jobItems.postedByUserId })
        .from(jobItems)
        .where(eq(jobItems.id, entityId))
        .limit(1);
      return row?.postedByUserId ?? null;
    }
    case "feed_post": {
      const [row] = await db
        .select({ userId: feedPosts.userId })
        .from(feedPosts)
        .where(eq(feedPosts.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "voice_clone": {
      const [row] = await db
        .select({ userId: studioVoiceClones.userId })
        .from(studioVoiceClones)
        .where(eq(studioVoiceClones.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "community_resource": {
      const [row] = await db
        .select({ userId: communityResources.submittedBy })
        .from(communityResources)
        .where(eq(communityResources.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "course": {
      const [row] = await db
        .select({ userId: courses.userId })
        .from(courses)
        .where(eq(courses.id, entityId))
        .limit(1);
      return row?.userId ?? null;
    }
  }
}

// ── Reporting ──────────────────────────────────────────────────────────────

export interface FileReportInput {
  reporterId: string;
  entityType: ReportEntityType;
  entityId: string;
  reason: ReportReason;
  notes?: string | null;
}

export interface FiledReport {
  id: string;
  reporterId: string;
  entityType: ReportEntityType;
  entityId: string;
  entityOwnerId: string | null;
  reason: ReportReason;
  notes: string | null;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  /** True when this call created the row; false when an existing
   *  pending/reviewing report was returned (idempotent). */
  created: boolean;
}

/** File a content abuse report. Idempotent — if the same reporter has
 *  an active pending/reviewing report against the same entity, that
 *  row is returned and no notifications fire again (avoids spamming
 *  admins with duplicate filings). */
export async function fileReport(
  deps: ModerationServiceDeps,
  input: FileReportInput,
): Promise<FiledReport> {
  if (!(REPORT_ENTITY_TYPES as readonly string[]).includes(input.entityType)) {
    throw new ModerationError("VALIDATION_ERROR", "Unknown entity type");
  }
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) {
    throw new ModerationError("VALIDATION_ERROR", "Unknown reason");
  }

  const db = getDb();

  // Idempotent: if the reporter already has an active filing for this
  // target, return the existing row and skip all side effects.
  const [existing] = await db
    .select()
    .from(contentReports)
    .where(
      and(
        eq(contentReports.reporterId, input.reporterId),
        eq(contentReports.entityType, input.entityType),
        eq(contentReports.entityId, input.entityId),
      ),
    )
    .limit(1);
  if (existing && (existing.status === "pending" || existing.status === "reviewing")) {
    return {
      id: existing.id,
      reporterId: existing.reporterId,
      entityType: existing.entityType as ReportEntityType,
      entityId: existing.entityId,
      entityOwnerId: (existing as any).entityOwnerId ?? null,
      reason: existing.reason as ReportReason,
      notes: existing.notes,
      status: existing.status as ReportStatus,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      created: false,
    };
  }

  // Snapshot the entity owner at report time so a later transfer doesn't
  // erase the audit trail.
  const ownerId = await resolveEntityOwner(input.entityType, input.entityId).catch(() => null);

  const [row] = await db
    .insert(contentReports)
    .values({
      reporterId: input.reporterId,
      entityType: input.entityType,
      entityId: input.entityId,
      entityOwnerId: ownerId,
      reason: input.reason,
      notes: input.notes ?? null,
      status: "pending",
    } as any)
    .returning();

  // Side effects: notify every super-admin, start (or reuse) a private
  // inbox thread between the reporter and each super-admin so follow-up
  // questions flow through /inbox. Best-effort — failures must NOT make
  // the report look like it didn't land.
  try {
    await fanOutNewReport(deps, {
      reportId: row.id,
      reporterId: input.reporterId,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      notes: input.notes ?? null,
    });
  } catch (err) {
    logger.error("[moderation] fan-out failed", err);
  }

  return {
    id: row.id,
    reporterId: row.reporterId,
    entityType: row.entityType as ReportEntityType,
    entityId: row.entityId,
    entityOwnerId: (row as any).entityOwnerId ?? ownerId,
    reason: row.reason as ReportReason,
    notes: row.notes,
    status: row.status as ReportStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    created: true,
  };
}

async function fanOutNewReport(
  deps: ModerationServiceDeps,
  payload: {
    reportId: string;
    reporterId: string;
    entityType: ReportEntityType;
    entityId: string;
    reason: ReportReason;
    notes?: string | null;
  },
): Promise<void> {
  const adminIds = await deps.repos.users.findSuperAdminIds();
  if (adminIds.length === 0) return;

  const { actor, actorName } = await resolveActor(deps, payload.reporterId);
  const title = `${actorName} reported a ${prettyEntityType(payload.entityType)}`;
  const message = `Reason: ${prettyReason(payload.reason)}.`;

  // Inbox notification fan-out — every admin sees the report land in
  // their inbox immediately.
  await emitNotification(deps, {
    recipientIds: adminIds,
    type: "moderation_report_filed",
    actor,
    title,
    message,
    target: { id: payload.reportId, type: "moderation_report" },
    extraData: {
      entityType: payload.entityType,
      entityId: payload.entityId,
      reason: payload.reason,
    },
  });

  // Email fan-out — every super-admin gets an email heads-up so flags
  // don't sit unseen until they next open /inbox. Best-effort: an email
  // failure must not bubble up and make the report look unfiled.
  try {
    const admins = await deps.repos.users.findManyByIds(adminIds);
    await Promise.all(
      admins
        .filter((a) => Boolean(a.email))
        .map((a) =>
          sendModerationFlagEmail(a.email as string, {
            reporterName: actorName,
            entityLabel: prettyEntityType(payload.entityType),
            reasonLabel: prettyReason(payload.reason),
            entityId: payload.entityId,
            notes: payload.notes ?? null,
          }).catch((err) =>
            logger.error("[moderation] flag email failed for admin", { adminId: a.id, error: err }),
          ),
        ),
    );
  } catch (err) {
    logger.error("[moderation] flag email fan-out failed", err);
  }

  // Inbox thread fan-out — each admin gets a direct conversation with
  // the reporter seeded with the report context. Find-or-create so a
  // second report against the same admin reuses the thread.
  await Promise.all(
    adminIds.map(async (adminId) => {
      try {
        await findOrCreateDirectConversation(deps, {
          initiatorId: payload.reporterId,
          recipientId: adminId,
          initialMessage:
            `[Moderation] I reported a ${prettyEntityType(payload.entityType)} ` +
            `for "${prettyReason(payload.reason)}". Report id: ${payload.reportId}.`,
        });
      } catch (err) {
        logger.error("[moderation] thread fan-out failed for admin", { adminId, error: err });
      }
    }),
  );
}

// ── Resolve ────────────────────────────────────────────────────────────────

export interface ResolveReportInput {
  reportId: string;
  resolverUserId: string;
  status: Exclude<ReportStatus, "pending">;
  resolution?: string | null;
}

/** Admin triage — flips the report state, notifies the reporter (and
 *  optionally the owner when action was taken so they know their
 *  content was moderated), then drops a recap message into the existing
 *  reporter ↔ admin inbox thread. */
export async function resolveReport(
  deps: ModerationServiceDeps,
  input: ResolveReportInput,
): Promise<FiledReport> {
  if (input.status === ("pending" as any)) {
    throw new ModerationError("VALIDATION_ERROR", "Cannot transition back to pending");
  }
  const db = getDb();

  const [row] = await db
    .update(contentReports)
    .set({
      status: input.status,
      resolution: input.resolution ?? null,
      resolvedBy: input.resolverUserId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(eq(contentReports.id, input.reportId))
    .returning();
  if (!row) {
    throw new ModerationError("NOT_FOUND", "Report not found");
  }

  // Notify the reporter that their filing was triaged.
  try {
    const { actor } = await resolveActor(deps, input.resolverUserId);
    await emitNotification(deps, {
      recipientIds: [row.reporterId],
      type: "moderation_report_resolved",
      actor,
      title: `Your report was ${prettyStatus(input.status)}`,
      message: input.resolution ?? "An admin reviewed your report.",
      target: { id: row.id, type: "moderation_report" },
      extraData: {
        entityType: row.entityType,
        entityId: row.entityId,
        status: input.status,
      },
    });
  } catch (err) {
    logger.error("[moderation] resolver notify failed", err);
  }

  // If action was taken, notify the entity owner too so they know
  // their content was moderated. Only fires when the owner snapshot
  // is present and is not the reporter themselves (a self-report
  // would otherwise loop the same user twice).
  const ownerId = (row as any).entityOwnerId as string | null;
  if (input.status === "resolved_action_taken" && ownerId && ownerId !== row.reporterId) {
    try {
      const { actor } = await resolveActor(deps, input.resolverUserId);
      await emitNotification(deps, {
        recipientIds: [ownerId],
        type: "moderation_action_taken",
        actor,
        title: `Action taken on your ${prettyEntityType(row.entityType as ReportEntityType)}`,
        message: input.resolution ?? "An admin moderated this content after a community report.",
        target: { id: row.id, type: "moderation_report" },
        extraData: {
          entityType: row.entityType,
          entityId: row.entityId,
          status: input.status,
        },
      });
    } catch (err) {
      logger.error("[moderation] owner notify failed", err);
    }
  }

  // Drop a recap into the existing reporter ↔ admin inbox thread.
  // findOrCreate is idempotent — if the thread was created when the
  // report was filed it's reused; otherwise the admin's recap creates it.
  try {
    const { conversation } = await findOrCreateDirectConversation(deps, {
      initiatorId: input.resolverUserId,
      recipientId: row.reporterId,
    });
    await sendMessage(deps, {
      conversationId: conversation.id,
      senderId: input.resolverUserId,
      content:
        `[Moderation] Your report (id ${row.id}) was ${prettyStatus(input.status)}.` +
        (input.resolution ? `\n\nNotes: ${input.resolution}` : ""),
    });
  } catch (err) {
    logger.error("[moderation] thread recap failed", err);
  }

  return {
    id: row.id,
    reporterId: row.reporterId,
    entityType: row.entityType as ReportEntityType,
    entityId: row.entityId,
    entityOwnerId: ownerId,
    reason: row.reason as ReportReason,
    notes: row.notes,
    status: row.status as ReportStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    created: false,
  };
}

// ── Display helpers (kept here so route + notification copy stay in sync) ──

const ENTITY_LABEL: Record<ReportEntityType, string> = {
  resume: "resume",
  job: "job listing",
  article: "article",
  service: "service",
  voice_clone: "voice clone",
  feed_post: "feed post",
  user_profile: "user profile",
  studio_template: "studio template",
  studio_project: "studio video",
  community_resource: "community resource",
  course: "course",
};

function prettyEntityType(t: ReportEntityType): string {
  return ENTITY_LABEL[t] ?? t;
}

const REASON_LABEL: Record<ReportReason, string> = {
  spam: "spam",
  impersonation: "impersonation",
  inappropriate: "inappropriate content",
  harassment: "harassment",
  copyright: "copyright violation",
  other: "other",
};

function prettyReason(r: ReportReason): string {
  return REASON_LABEL[r] ?? r;
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "received",
  reviewing: "under review",
  resolved_action_taken: "upheld — action taken",
  resolved_no_action: "reviewed — no action needed",
  dismissed: "dismissed",
};

function prettyStatus(s: ReportStatus): string {
  return STATUS_LABEL[s] ?? s;
}

// Mark types intentionally re-exported so route callers import from one place.
export { REPORT_STATUSES };
