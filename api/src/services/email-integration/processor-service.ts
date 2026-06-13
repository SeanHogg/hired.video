/**
 * Inbox processor mutations + dry-run (#1983).
 *
 * Thin service over the profile/action repos so the route handlers stay
 * declarative. Every mutation that changes a profile invalidates its
 * cache entry (`invalidateInboxProfile`) — the read path is cached.
 *
 * `dryRun` re-classifies a sample of the user's most-recent messages
 * under a candidate profile WITHOUT persisting, so the builder can prove
 * a prompt/taxonomy change before it touches the live inbox.
 */

import type { Repos } from "../../repositories/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import type { InboxProfileRow } from "../../repositories/inboxProfilesRepository.js";
import { classifyEmail } from "./classify.js";
import { invalidateInboxProfile } from "./profile-service.js";
import {
  decodeInboxProfile,
  isVisibleCategory,
  type InboxProfileShape,
} from "../../../../shared/email-classification/index.js";

export function rowToProfileShape(row: InboxProfileRow): InboxProfileShape {
  return decodeInboxProfile({
    id: row.id,
    ownerId: row.ownerId ?? null,
    roles: row.roles,
    name: row.name,
    description: row.description ?? null,
    isPreset: row.isPreset,
    presetKey: row.presetKey ?? null,
    taxonomy: row.taxonomy,
    classifyPrompt: row.classifyPrompt,
    summaryPrompt: row.summaryPrompt ?? null,
    extractSchema: row.extractSchema,
    defaultRuleSet: row.defaultRuleSet ?? null,
    minRelevanceScore: row.minRelevanceScore as any,
    version: row.version,
  });
}

/** Clone a profile (usually a preset) into an editable owner-scoped copy
 *  at the source's content, version reset to 1. */
export async function cloneProfile(
  repos: Pick<Repos, "inboxProfiles">,
  ownerId: string,
  sourceProfileId: string,
  overrides?: { name?: string },
): Promise<InboxProfileRow | null> {
  const source = await repos.inboxProfiles.findById(sourceProfileId);
  if (!source) return null;
  // Only presets or the user's own profiles can be cloned.
  if (!source.isPreset && source.ownerId !== ownerId) return null;
  return repos.inboxProfiles.insert({
    ownerId,
    roles: source.roles,
    name: overrides?.name?.slice(0, 120) || `${source.name} (copy)`,
    description: source.description,
    isPreset: false,
    presetKey: null,
    taxonomy: source.taxonomy,
    classifyPrompt: source.classifyPrompt,
    summaryPrompt: source.summaryPrompt,
    extractSchema: source.extractSchema,
    defaultRuleSet: source.defaultRuleSet,
    minRelevanceScore: source.minRelevanceScore,
    version: 1,
  } as any);
}

/** Patch an owner-scoped profile; bumps version + invalidates cache. */
export async function updateProfile(
  repos: Pick<Repos, "inboxProfiles">,
  ownerId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<InboxProfileRow | null> {
  const updated = await repos.inboxProfiles.patchOwned(id, ownerId, patch as any);
  if (updated) invalidateInboxProfile(id);
  return updated;
}

export async function deleteProfile(
  repos: Pick<Repos, "inboxProfiles">,
  ownerId: string,
  id: string,
): Promise<void> {
  await repos.inboxProfiles.removeOwned(id, ownerId);
  invalidateInboxProfile(id);
}

export interface DryRunRow {
  messageId: string;
  from: string;
  subject: string | null;
  category: string;
  score: number;
  source: string;
  visible: boolean;
  extracted: Record<string, unknown> | null;
}

/** Re-classify the user's most-recent N messages under `profile` without
 *  persisting. Uses the same Stage-1 + Stage-2 path as live ingest so the
 *  preview matches production. Stage-2 LLM calls bill the token ledger. */
export async function dryRun(
  deps: { repos: Pick<Repos, "inboxProfiles" | "externalEmailMessages" | "emailUserRules">; llm: LLMClient },
  ownerId: string,
  profileId: string,
  sampleSize = 10,
): Promise<{ profileName: string; rows: DryRunRow[] } | null> {
  const profileRow = await deps.repos.inboxProfiles.findById(profileId);
  if (!profileRow) return null;
  if (!profileRow.isPreset && profileRow.ownerId !== ownerId) return null;
  const profile = rowToProfileShape(profileRow);

  const [messages, userRules] = await Promise.all([
    deps.repos.externalEmailMessages.findRecentRawForUser(ownerId, sampleSize),
    deps.repos.emailUserRules.findEnabledForProfile(
      ownerId,
      profileId,
      profile.roles.includes("job_seeker"),
    ),
  ]);

  const rows: DryRunRow[] = [];
  for (const m of messages) {
    const email = {
      providerMessageId: m.providerMessageId,
      providerThreadId: m.providerThreadId,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      subject: m.subject ?? "",
      snippet: m.snippet ?? "",
      bodyHtml: m.bodyHtml,
      bodyText: m.bodyText,
      receivedAt: (m.receivedAt instanceof Date ? m.receivedAt.toISOString() : String(m.receivedAt)),
      rawMetadata: {},
    } as any;
    const classification = await classifyEmail({ llm: deps.llm }, email, userRules, profile);
    rows.push({
      messageId: m.id,
      from: m.fromEmail,
      subject: m.subject ?? null,
      category: classification.category,
      score: classification.score,
      source: classification.source,
      visible: isVisibleCategory(classification.category, profile),
      extracted: classification.extracted ?? null,
    });
  }
  return { profileName: profile.name, rows };
}
