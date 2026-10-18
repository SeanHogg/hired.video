/**
 * Vendor Sync use cases — master résumé ↔ third-party profile
 * (`/api/vendor-sync/*`, routes/vendor-sync.ts). The route validates input;
 * these functions resolve the connector + owned résumé, run the extract /
 * merge, and keep the `profile_sync_runs` audit row in step. Failures throw
 * DomainError (same codes and statuses the route always returned).
 */
import { DomainError } from "../../domains/errors.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMEnv } from "../adapters/llm-client.js";
import { analyzeMerge, executeMerge, type MergeDecision } from "../resume/merge.js";
import { healAndValidateContent } from "../resume/content.js";
import { normalizeJsonResume } from "../resume/parse.js";
import { liveResumes } from "../resume/deps.js";
import { getConnector, listConnectors } from "./connectors/index.js";
import { extractFromHtml } from "./extract-from-html.js";
import { finalizeRun, lastRunPerConnector, recordExportRun, recordImportStart } from "./sync-run-service.js";
import type { ResumeContent } from "../../../../shared/resume.js";
import type { JwtPayload } from "../../types/index.js";

function requireConnector(connectorId: string) {
  const connector = getConnector(connectorId);
  if (!connector) throw new DomainError(404, "NOT_FOUND", `Unknown connector: ${connectorId}`);
  return connector;
}

async function requireOwnedResume(resumeId: string, userId: string, message: string) {
  const resume = await liveResumes().findByIdForOwner(resumeId, userId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", message);
  return resume;
}

/** Connector registry with the caller's last run per vendor (anon → no overlay). */
export async function listConnectorsWithLastRun(userId: string | null) {
  const lastByConnector = userId ? await lastRunPerConnector(userId) : {};
  return listConnectors().map((v) => {
    const last = lastByConnector[v.id];
    return {
      id: v.id,
      label: v.label,
      iconKey: v.iconKey,
      category: v.category,
      description: v.description,
      editProfileUrl: v.editProfileUrl,
      supportsExtensionExtract: v.supportsExtensionExtract,
      supportsExtensionWrite: v.supportsExtensionWrite,
      lastRun: last
        ? { id: last.id, direction: last.direction, startedAt: last.startedAt, completedAt: last.completedAt }
        : null,
    };
  });
}

export interface VendorImportInput {
  html: string;
  sourceUrl: string;
  targetResumeId: string;
}

/** HTML → JSON Resume → MergeAnalysis against an owned target résumé. */
export async function importVendorProfile(
  env: LLMEnv | undefined,
  user: JwtPayload,
  connectorId: string,
  input: VendorImportInput,
) {
  const connector = requireConnector(connectorId);
  if (!connector.supportsExtensionExtract) {
    throw new DomainError(400, "NOT_SUPPORTED", `${connector.label} does not support extension-driven extraction yet`);
  }
  const { html, sourceUrl, targetResumeId } = input;
  const target = await requireOwnedResume(targetResumeId, user.sub, "Target resume not found");

  if (!hasAnyLLMProviderKey(env)) {
    throw new DomainError(503, "AI_UNAVAILABLE", "Vendor extraction requires an LLM provider — none configured");
  }
  const llm = createLLMClient(env, user);

  // Persist `pending` BEFORE the LLM call so a hung extract still leaves
  // a row to debug from. Finalized on /execute or on extractor failure.
  const run = await recordImportStart({ userId: user.sub, connectorId, targetResumeId, sourceUrl });

  let extracted;
  try {
    extracted = await extractFromHtml(llm, { html, sourceUrl, connectorId });
  } catch (err) {
    await finalizeRun({
      runId: run.id,
      userId: user.sub,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "extractor failed",
    });
    throw new DomainError(502, "AI_ERROR", "Failed to extract profile from page HTML");
  }

  const sourceContent = normalizeJsonResume(extracted as Record<string, unknown>);
  const targetContent = normalizeJsonResume((target.content ?? {}) as Record<string, unknown>);
  const analysis = await analyzeMerge(sourceContent, targetContent, llm);
  return { syncRunId: run.id, sourceContent, targetContent, analysis };
}

export interface VendorExecuteInput {
  syncRunId: string;
  sourceContent: Record<string, unknown>;
  targetResumeId: string;
  decisions: MergeDecision[];
  basicDecisions?: Record<string, "source" | "target">;
  createNew: boolean;
  newTitle?: string;
}

/** Commit a reviewed merge into the target (in place, or as a new child). */
export async function executeVendorMerge(userId: string, connectorId: string, input: VendorExecuteInput) {
  const connector = requireConnector(connectorId);
  const { syncRunId, sourceContent, targetResumeId, decisions, basicDecisions, createNew, newTitle } = input;
  const repo = liveResumes();
  const target = await repo.findByIdForOwner(targetResumeId, userId);
  if (!target) throw new DomainError(404, "NOT_FOUND", "Target resume not found");

  // Merge is a pure transform; healAndValidate hardens the result before
  // it touches the DB — same pattern as /api/resumes/merge/execute.
  const mergedContent = executeMerge(
    (target.content ?? {}) as Record<string, any>,
    sourceContent as Record<string, any>,
    decisions,
    basicDecisions,
  );
  const heal = healAndValidateContent(mergedContent);
  if (!heal.ok) {
    await finalizeRun({ runId: syncRunId, userId, status: "failed", errorMessage: "Merge produced invalid content" });
    throw new DomainError(400, "MERGE_INVALID", "Merged content failed validation", heal.issues);
  }
  const healedContent = heal.content as Record<string, unknown>;

  let resumeId: string;
  let title: string;
  if (createNew) {
    title = newTitle || `${target.title} (synced from ${connector.label})`;
    const created = await repo.insertOne({
      userId,
      title,
      content: healedContent,
      status: "draft",
      isMaster: false,
      isActive: false,
      parentId: targetResumeId,
      privacyLevel: target.privacyLevel ?? 10,
    } as any);
    resumeId = created.id;
  } else {
    await repo.updateByIdForOwner(targetResumeId, userId, { content: healedContent });
    resumeId = targetResumeId;
    title = target.title;
  }

  const result = {
    resumeId,
    title,
    mergedSections: decisions.filter((d) => d.action === "merge" || d.action === "replace").length,
    skippedSections: decisions.filter((d) => d.action === "skip").length,
    newSections: decisions.filter((d) => d.action === "add").length,
  };

  await finalizeRun({ runId: syncRunId, userId, status: "success", decisionsSnapshot: decisions, resultSnapshot: result });
  return result;
}

/** Export paste-blocks for one owned résumé. */
export async function renderVendorBlocks(userId: string, connectorId: string, resumeId: string) {
  const connector = requireConnector(connectorId);
  const resume = await requireOwnedResume(resumeId, userId, "Resume not found");
  const content = normalizeJsonResume((resume.content ?? {}) as Record<string, unknown>) as ResumeContent;
  return {
    connectorId: connector.id,
    resumeId: resume.id,
    resumeTitle: resume.title,
    editProfileUrl: connector.editProfileUrl,
    blocks: connector.renderExportBlocks(content),
  };
}

/** The user marks a manual export sync as done. */
export async function markManualSync(
  userId: string,
  input: { connectorId: string; sourceResumeId: string; notes?: string },
) {
  requireConnector(input.connectorId);
  await requireOwnedResume(input.sourceResumeId, userId, "Resume not found");
  return recordExportRun({
    userId,
    connectorId: input.connectorId,
    sourceResumeId: input.sourceResumeId,
    notes: input.notes ?? null,
  });
}
