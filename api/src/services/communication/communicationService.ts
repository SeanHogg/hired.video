/**
 * Communication hub use cases behind /api/communication: the conversation
 * endpoints (participant-gated), the shared email-template library, and the
 * caller's outreach tracking log. Throws DomainError; the global handler maps
 * it onto the error envelope.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos, type Repos } from "../../repositories/index.js";
import type {
  ConversationParticipantRow,
  ConversationRow,
  MessageRow,
} from "../../repositories/conversationsRepository.js";
import type { TemplateRow } from "../../repositories/campaignRepository.js";
import {
  insertCommunicationTracking,
  listCommunicationTrackingForUser,
  type CommunicationTrackingRow,
} from "../../repositories/communicationTrackingRepository.js";
import { findOrCreateDirectConversation, sendMessage } from "../messaging/messagingService.js";
import { CampaignService } from "../campaigns/CampaignService.js";

type Body = Record<string, any>;

const conversationNotFound = () => new DomainError(404, "NOT_FOUND", "Conversation not found");
const templateNotFound = () => new DomainError(404, "NOT_FOUND", "Template not found");

function repos(): Repos {
  return buildRepos(getDb());
}

// ── Conversations ──────────────────────────────────────────────────────

export function listConversations(userId: string): Promise<ConversationRow[]> {
  return repos().conversations.findConversationsForUser(userId);
}

/**
 * Start a conversation. Direct (one other participant) dedupes on the pair
 * so clicking "Message" twice reuses the thread; group/broadcast is a
 * straight create with every participant (caller included).
 */
export async function createConversation(userId: string, body: Body): Promise<ConversationRow> {
  const participantIds: string[] = Array.isArray(body.participantUserIds)
    ? body.participantUserIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : [];
  // Numeric enums on the wire (0 = Direct, 1 = Group, 2 = Broadcast); the
  // string forms are accepted too so scripts/curl don't need the numbers.
  const type = body.type === 0 || body.type === "direct" || body.type === undefined ? "direct" : "group";
  const r = repos();

  if (type === "direct" && participantIds.length === 1) {
    const { conversation } = await findOrCreateDirectConversation(
      { repos: r },
      {
        initiatorId: userId,
        recipientId: participantIds[0],
        initialMessage: typeof body.initialMessage === "string" ? body.initialMessage : undefined,
      },
    );
    return conversation;
  }

  const subject = typeof body.title === "string" ? body.title : null;
  const conversation = await r.conversations.insertConversation({ subject, type });
  const allParticipants = Array.from(new Set([userId, ...participantIds]));
  await r.conversations.insertConversationParticipants(
    allParticipants.map((u) => ({ conversationId: conversation.id, userId: u, role: "member" })),
  );
  return conversation;
}

export type ConversationDetail = ConversationRow & {
  participants: ConversationParticipantRow[];
  messages: MessageRow[];
};

/** The conversation + participants + messages — participants only (a
 *  non-member gets the same 404 as a missing thread). */
export async function getConversationDetail(userId: string, conversationId: string): Promise<ConversationDetail> {
  const r = repos();
  const conversation = await r.conversations.findConversationById(conversationId);
  if (!conversation) throw conversationNotFound();
  const participants = await r.conversations.findParticipantsForConversation(conversationId);
  if (!participants.some((p) => p.userId === userId)) throw conversationNotFound();
  const messages = await r.conversations.findMessagesForConversation(conversationId);
  return { ...conversation, participants, messages };
}

export function listMessages(
  userId: string,
  opts: { conversationId?: string; limit: number },
): Promise<MessageRow[]> {
  return repos().conversations.findMessagesForParticipant(userId, opts);
}

/** Send into a conversation the caller participates in (notifies the others). */
export async function postMessage(userId: string, conversationId: string, content: string): Promise<MessageRow> {
  const r = repos();
  const conversation = await r.conversations.findConversationById(conversationId);
  if (!conversation || !(await r.conversations.isParticipant(conversationId, userId))) {
    throw conversationNotFound();
  }
  try {
    return await sendMessage({ repos: r }, { conversationId, senderId: userId, content });
  } catch (err) {
    throw new DomainError(400, "VALIDATION_ERROR", (err as Error).message);
  }
}

// ── Email-template library ─────────────────────────────────────────────

export function listEmailTemplates(): Promise<TemplateRow[]> {
  return repos().campaigns.listTemplates();
}

export async function getEmailTemplate(id: string): Promise<TemplateRow> {
  const row = await repos().campaigns.findTemplate(id);
  if (!row) throw templateNotFound();
  return row;
}

export function createEmailTemplate(body: Body): Promise<TemplateRow> {
  return repos().campaigns.createTemplate({
    name: String(body.name ?? "Untitled"),
    subject: String(body.subject ?? ""),
    htmlBody: String(body.body ?? ""),
    textBody: String(body.textBody ?? ""),
    variables: body.variables ?? [],
    isActive: body.isActive ?? true,
  });
}

/** Patch a template; omitted fields are left as they are. */
export async function updateEmailTemplate(id: string, body: Body): Promise<TemplateRow> {
  const row = await repos().campaigns.updateTemplate(id, {
    name: body.name,
    subject: body.subject,
    htmlBody: body.body,
    textBody: body.textBody,
    variables: body.variables,
    isActive: body.isActive,
  });
  if (!row) throw templateNotFound();
  return row;
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  await repos().campaigns.deleteTemplate(id);
}

// ── Outreach email campaigns (the caller's own) ────────────────────────

/** The caller's campaigns as canonical `CampaignDTO[]` (#1970). */
export function listMyCampaigns(userId: string) {
  return CampaignService.live().listByUser(userId);
}

/**
 * Create a draft campaign through the canonical engine (#1971), persisting
 * the recipients as a `list` audience so it is actually sendable.
 */
export function createMyCampaign(userId: string, body: Body) {
  const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];
  const recipients = rawRecipients
    .filter((r: any) => r && typeof r.email === "string" && r.email.includes("@"))
    .map((r: any) => ({
      email: String(r.email),
      ...(r.name ? { name: String(r.name).slice(0, 255) } : {}),
    }));
  // The dialog creates a template first, then passes its id. Accept either the
  // legacy `templateId` or the dialog's `emailTemplateId`.
  const templateId = (body.templateId ?? body.emailTemplateId) || null;
  // CreateCampaignSchema requires a non-empty subject; the email's real
  // subject comes from the attached template at render time (resolveContent
  // falls back to it), so the campaign name is a safe placeholder.
  const subject = String(body.subject || body.name || "Campaign").slice(0, 500);
  return CampaignService.live().create(
    {
      name: String(body.name ?? "Campaign").slice(0, 255),
      subject,
      description: body.description ? String(body.description).slice(0, 1000) : undefined,
      templateId,
      audience: recipients.length > 0 ? { kind: "list", recipients } : undefined,
      status: "draft",
    },
    { createdByUserId: userId },
  );
}

/**
 * Real send: hand one of the caller's campaigns to the engine (resolve
 * audience → render → send on the cron loop). Someone else's campaign reads
 * exactly like a missing one.
 */
export async function sendMyCampaign(userId: string, campaignId: string) {
  const db = getDb();
  const row = await buildRepos(db).campaigns.findCampaign(campaignId);
  if (!row || row.createdByUserId !== userId) {
    throw new DomainError(400, "VALIDATION_ERROR", "Campaign not found");
  }
  const result = await CampaignService.create(db).schedule(campaignId, null);
  if (result.ok && result.campaign) return result.campaign;
  throw new DomainError(400, "VALIDATION_ERROR", result.reason ?? "Cannot send campaign");
}

// ── Tracking (the caller's own outreach log) ───────────────────────────

export function listTracking(userId: string): Promise<CommunicationTrackingRow[]> {
  return listCommunicationTrackingForUser(userId);
}

export function recordTracking(userId: string, body: Body): Promise<CommunicationTrackingRow> {
  return insertCommunicationTracking({
    userId,
    type: String(body.type ?? ""),
    channel: String(body.channel ?? ""),
    referenceId: body.referenceId as string | undefined,
    referenceType: String(body.referenceType ?? ""),
    status: String(body.status ?? "sent"),
    metadata: body.metadata ?? {},
  });
}
