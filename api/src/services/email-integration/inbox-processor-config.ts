/**
 * Inbox-processor configuration use cases (the /api/integrations/email
 * rules / profiles / actions / action-runs routes, #1979–#1984): the user's
 * classification rules, role-keyed profiles (presets are shared + read-only,
 * users clone owner-scoped copies) and per-profile post-classify actions.
 * Request bodies are loosely typed client payloads — each field is picked
 * and coerced here; unknown fields are ignored.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos, type Repos } from "../../repositories/index.js";
import type { InboxProfileRow } from "../../repositories/inboxProfilesRepository.js";
import {
  INBOX_ACTION_TRIGGER_VALUES,
  INBOX_ACTION_HANDLER_VALUES,
} from "../../../../shared/email-classification/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { cloneProfile, deleteProfile, dryRun, rowToProfileShape, updateProfile } from "./processor-service.js";

type Body = Record<string, any>;

function repos(): Repos {
  return buildRepos(getDb());
}

const noSupportedFields = () => new DomainError(400, "VALIDATION_ERROR", "No supported fields in patch");
const profileNotFound = () => new DomainError(404, "NOT_FOUND", "Profile not found");

/** Presets are visible to everyone; clones only to their owner. */
function isVisibleTo(row: InboxProfileRow | null, userId: string): row is InboxProfileRow {
  return !!row && (row.isPreset || row.ownerId === userId);
}

// ── Rules ────────────────────────────────────────────────────────────────────

/** `profileId` scopes to one profile's rules (builder UI); omitted = all of
 *  the user's rules (Settings panel). */
export function listEmailRules(userId: string, profileId: string | undefined) {
  const rules = repos().emailUserRules;
  return profileId ? rules.findAllForProfile(userId, profileId) : rules.findAllForUser(userId);
}

export function createEmailRule(userId: string, body: Body | null) {
  if (!body || typeof body.name !== "string" || !Array.isArray(body.conditions)) {
    throw new DomainError(400, "VALIDATION_ERROR", "Required: name, conditions[]");
  }
  return repos().emailUserRules.insert({
    userId,
    profileId: typeof body.profileId === "string" ? body.profileId : null,
    name: body.name.slice(0, 120),
    conditions: body.conditions,
    actionCategory: typeof body.actionCategory === "string" ? body.actionCategory : "other",
    actionScore: String(typeof body.actionScore === "number" ? body.actionScore : 1),
    isEnabled: body.isEnabled !== false,
    priority: typeof body.priority === "number" ? body.priority : 100,
  } as any);
}

export async function patchEmailRule(userId: string, id: string, body: Body): Promise<void> {
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "actionCategory"] as const) {
    if (typeof body[k] === "string") patch[k] = body[k];
  }
  if (Array.isArray(body.conditions)) patch.conditions = body.conditions;
  if (typeof body.actionScore === "number") patch.actionScore = String(body.actionScore);
  if (typeof body.isEnabled === "boolean") patch.isEnabled = body.isEnabled;
  if (typeof body.priority === "number") patch.priority = body.priority;
  await repos().emailUserRules.patch(id, userId, patch as any);
}

export async function removeEmailRule(userId: string, id: string): Promise<void> {
  await repos().emailUserRules.remove(id, userId);
}

// ── Profiles ─────────────────────────────────────────────────────────────────

/** Every profile the user may use, decoded to the runtime shape. */
export async function listInboxProfiles(userId: string) {
  const rows = await repos().inboxProfiles.listAvailableForOwner(userId);
  return rows.map((r) => rowToProfileShape(r));
}

export async function getInboxProfile(userId: string, id: string) {
  const row = await repos().inboxProfiles.findById(id);
  if (!isVisibleTo(row, userId)) throw profileNotFound();
  return rowToProfileShape(row);
}

/** Clone a profile (preset or own) into an editable copy. */
export async function cloneInboxProfile(userId: string, body: Body | null) {
  if (!body || typeof body.sourceProfileId !== "string") {
    throw new DomainError(400, "VALIDATION_ERROR", "Required: sourceProfileId");
  }
  const cloned = await cloneProfile(repos(), userId, body.sourceProfileId, {
    name: typeof body.name === "string" ? body.name : undefined,
  });
  if (!cloned) throw new DomainError(404, "NOT_FOUND", "Source profile not found");
  return rowToProfileShape(cloned);
}

export async function patchInboxProfile(userId: string, id: string, body: Body) {
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
  if (typeof body.description === "string") patch.description = body.description;
  if (Array.isArray(body.taxonomy)) patch.taxonomy = body.taxonomy;
  if (typeof body.classifyPrompt === "string") patch.classifyPrompt = body.classifyPrompt;
  if (typeof body.summaryPrompt === "string" || body.summaryPrompt === null) {
    patch.summaryPrompt = body.summaryPrompt;
  }
  if (body.extractSchema === null || (body.extractSchema && typeof body.extractSchema === "object")) {
    patch.extractSchema = body.extractSchema;
  }
  if (Array.isArray(body.roles)) patch.roles = body.roles;
  if (typeof body.defaultRuleSet === "string" || body.defaultRuleSet === null) {
    patch.defaultRuleSet = body.defaultRuleSet;
  }
  if (typeof body.minRelevanceScore === "number" && Number.isFinite(body.minRelevanceScore)) {
    patch.minRelevanceScore = Math.max(0, Math.min(1, body.minRelevanceScore)).toFixed(3);
  }
  if (Object.keys(patch).length === 0) throw noSupportedFields();
  const updated = await updateProfile(repos(), userId, id, patch);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Profile not found or not editable");
  return rowToProfileShape(updated);
}

export async function removeInboxProfile(userId: string, id: string): Promise<void> {
  await deleteProfile(repos(), userId, id);
}

/** Classify a sample of the last N synced messages under this profile
 *  WITHOUT persisting (guards a bad prompt). N is clamped to 1..20. */
export async function dryRunInboxProfile(llm: LLMClient, userId: string, id: string, body: Body) {
  const sampleSize = Math.min(20, Math.max(1, Number(body.sampleSize ?? 10) || 10));
  const result = await dryRun({ repos: repos(), llm }, userId, id, sampleSize);
  if (!result) throw profileNotFound();
  return result;
}

// ── Actions (#1981) ──────────────────────────────────────────────────────────

export async function listProfileActions(userId: string, profileId: string) {
  const r = repos();
  if (!isVisibleTo(await r.inboxProfiles.findById(profileId), userId)) throw profileNotFound();
  return r.inboxActions.findAllForProfile(profileId);
}

/** Only the owner of a cloned profile may attach actions to it. */
export async function createProfileAction(userId: string, profileId: string, body: Body | null) {
  if (
    !body ||
    typeof body.name !== "string" ||
    !INBOX_ACTION_TRIGGER_VALUES.includes(body.triggerType) ||
    !INBOX_ACTION_HANDLER_VALUES.includes(body.handler)
  ) {
    throw new DomainError(400, "VALIDATION_ERROR", "Required: name, valid triggerType, valid handler");
  }
  const r = repos();
  const profile = await r.inboxProfiles.findById(profileId);
  if (!profile || profile.ownerId !== userId) {
    throw new DomainError(403, "FORBIDDEN", "Can only add actions to your own profile");
  }
  return r.inboxActions.insert({
    profileId,
    ownerId: userId,
    name: body.name.slice(0, 120),
    triggerType: body.triggerType,
    triggerValue: typeof body.triggerValue === "string" ? body.triggerValue.slice(0, 120) : null,
    handler: body.handler,
    config: body.config && typeof body.config === "object" ? body.config : null,
    isEnabled: body.isEnabled !== false,
    priority: typeof body.priority === "number" ? body.priority : 100,
  } as any);
}

export async function patchProfileAction(userId: string, id: string, body: Body) {
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
  if (INBOX_ACTION_TRIGGER_VALUES.includes(body.triggerType)) patch.triggerType = body.triggerType;
  if (typeof body.triggerValue === "string" || body.triggerValue === null) {
    patch.triggerValue = body.triggerValue;
  }
  if (INBOX_ACTION_HANDLER_VALUES.includes(body.handler)) patch.handler = body.handler;
  if (body.config === null || (body.config && typeof body.config === "object")) patch.config = body.config;
  if (typeof body.isEnabled === "boolean") patch.isEnabled = body.isEnabled;
  if (typeof body.priority === "number") patch.priority = body.priority;
  if (Object.keys(patch).length === 0) throw noSupportedFields();
  const updated = await repos().inboxActions.patchOwned(id, userId, patch as any);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Action not found or not owned");
  return updated;
}

export async function removeProfileAction(userId: string, id: string): Promise<void> {
  await repos().inboxActions.removeOwned(id, userId);
}

/** The action-run audit for Sync History (#1981). */
export async function listActionRuns(userId: string, limit: number) {
  const runs = await repos().inboxActionRuns.findRecentForUser(userId, limit);
  return runs.map((r) => ({
    id: r.id,
    messageId: r.messageId,
    actionId: r.actionId,
    handler: r.handler,
    status: r.status,
    targetType: r.targetType,
    targetId: r.targetId,
    detail: r.detail,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
  }));
}
