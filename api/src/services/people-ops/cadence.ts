/**
 * People-Ops cadence use cases — Meeting Intelligence AI summarize (PO-9) and
 * the Workflow Automation execution engine (PO-10). The engine fires its
 * actions: create_task produces tasks-backed action items in ONE multi-row
 * insert; every other action is delivered best-effort via workflow-delivery.
 * Throws DomainError; the global handler renders the envelope.
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import type { SegmentScope } from "../../repositories/peopleEmployeesRepository.js";
import { PeopleActionItemsRepository } from "../../repositories/peopleActionItemsRepository.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import { deliverWorkflowAction } from "./workflow-delivery.js";
import { segmentStore } from "./segmentStore.js";

export interface CadenceScope extends SegmentScope {
  companyId: string;
}

/** Summarize a transcript with the LLM and mirror its action items into tasks. */
export async function summarizeMeetingTranscript(
  ctx: SegmentScope,
  transcriptId: string,
  actorUserId: string,
  env: Parameters<typeof createLLMClient>[0],
  user: Parameters<typeof createLLMClient>[1],
): Promise<any> {
  const repo = segmentStore("meetingTranscripts");
  const row = await repo.findById(ctx, transcriptId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Transcript not found");
  if (!hasAnyLLMProviderKey(env)) throw new DomainError(503, "UNAVAILABLE", "AI is not configured");
  try {
    const llm = createLLMClient(env, user);
    const { content } = await llm.callText("ops_meeting_summary", {
      useCase: "chat",
      systemPrompt:
        "You are a CHRO meeting-intelligence assistant. Given a transcript, return STRICT JSON: " +
        '{"summary": string, "keyPoints": string[], "actionItems": string[], "decisions": string[]}. No prose outside the JSON.',
      userMessage: String(row.transcript).slice(0, 24000),
    });
    let parsed: any = {};
    try { parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim()); } catch { parsed = { summary: content }; }
    const updated = await repo.update(ctx, row.id, {
      summary: parsed.summary ?? null,
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : null,
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : null,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : null,
      processedAt: new Date(),
    });
    // Mirror extracted action items into the canonical tasks-backed store.
    if (Array.isArray(parsed.actionItems) && parsed.actionItems.length) {
      await new PeopleActionItemsRepository(getDb()).insertMany(
        ctx,
        parsed.actionItems.slice(0, 50).map((title: string) => ({ title: String(title).slice(0, 300), createdBy: actorUserId, sourceType: "meeting" as const })),
      );
    }
    return updated;
  } catch {
    throw new DomainError(502, "AI_ERROR", "Could not summarize the transcript");
  }
}

export interface WorkflowRunResult {
  executionId: string;
  status: "succeeded";
  results: { action: string; ok: boolean; detail?: string }[];
}

/** Run a trigger's ordered actions and record a workflow_execution. */
export async function runWorkflow(ctx: CadenceScope, triggerId: string, actorUserId: string): Promise<WorkflowRunResult> {
  const triggers = segmentStore("workflowTriggers");
  const trigger = await triggers.findById(ctx, triggerId);
  if (!trigger) throw new DomainError(404, "NOT_FOUND", "Workflow not found");

  const execRepo = segmentStore("workflowExecutions");
  const exec = await execRepo.insert(ctx, { triggerId: trigger.id, status: "running" });

  const results: { action: string; ok: boolean; detail?: string }[] = [];
  try {
    const actions = (trigger.actions as { type: string; config: Record<string, unknown>; order: number }[]).slice().sort((a, b) => a.order - b.order);
    // Every create_task action is written in ONE multi-row insert up front;
    // a failure aborts the run.
    await new PeopleActionItemsRepository(getDb()).insertMany(
      ctx,
      actions
        .filter((a) => a.type === "create_task")
        .map((a) => ({
          title: String(a.config.title ?? `${trigger.name} task`).slice(0, 300),
          description: a.config.description ? String(a.config.description) : null,
          createdBy: actorUserId,
          sourceType: "manual" as const,
        })),
    );
    for (const a of actions) {
      if (a.type === "create_task") {
        results.push({ action: a.type, ok: true });
      } else {
        // notify / send_notification / escalate → in-app; send_email → mailer;
        // slack_message → company Slack webhook (#1843). Failures are
        // recorded, never abort the run.
        results.push(await deliverWorkflowAction(a, {
          tenantId: ctx.tenantId,
          segmentId: ctx.segmentId,
          companyId: ctx.companyId,
          actorUserId,
          workflowName: trigger.name,
        }));
      }
    }
    await execRepo.update(ctx, exec.id, { status: "succeeded", completedAt: new Date(), results: { actions: results } });
    await triggers.update(ctx, trigger.id, { lastTriggeredAt: new Date() });
    return { executionId: exec.id, status: "succeeded", results };
  } catch (e) {
    await execRepo.update(ctx, exec.id, { status: "failed", completedAt: new Date(), errorMessage: e instanceof Error ? e.message : "error", results: { actions: results } });
    throw new DomainError(500, "WORKFLOW_FAILED", "Workflow execution failed");
  }
}
