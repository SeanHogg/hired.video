/**
 * Job-board scraper source use cases (#86) behind `/api/admin/job-sources`
 * (staff, global sources) and `/api/job-sources` (a user's own custom
 * sources, capped at MAX_CUSTOM_SOURCES_PER_USER).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { signalScrapeSourcesActive } from "../scheduling/work-signals.js";
import {
  JobBoardSourcesRepository,
  type JobBoardSourceInsert,
  type JobBoardSourcePatch,
  type JobBoardSourceRow,
  type JobBoardSyncLogRow,
} from "../../repositories/jobBoardSourcesRepository.js";

export const MAX_CUSTOM_SOURCES_PER_USER = 10;

export interface JobSourceInput {
  name: string;
  url: string;
  type: "rss" | "json_api" | "html";
  apiKey?: string;
  config?: Record<string, unknown>;
  schedule?: string;
  isActive: boolean;
}

const repo = () => new JobBoardSourcesRepository(getDb());

const notFound = () => new DomainError(404, "NOT_FOUND", "Source not found");

/** Loose PATCH body → column patch. Staff may also change `type` and `schedule`. */
function buildPatch(body: unknown, staff: boolean): JobBoardSourcePatch {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const patch: JobBoardSourcePatch = { updatedAt: new Date() };
  if (typeof b.name === "string") patch.name = b.name;
  if (typeof b.url === "string") patch.url = b.url;
  if (staff && typeof b.type === "string") patch.type = b.type;
  if (typeof b.apiKey === "string") patch.apiKey = b.apiKey;
  if (b.config && typeof b.config === "object") patch.config = b.config;
  if (staff && typeof b.schedule === "string") patch.schedule = b.schedule;
  if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
  return patch;
}

function toInsert(input: JobSourceInput, createdByUserId: string | null | undefined, scope: string): JobBoardSourceInsert {
  return { ...input, config: input.config ?? {}, createdByUserId: createdByUserId ?? null, scope };
}

// ── staff (global) ──────────────────────────────────────────────────────────

export function listAllJobSources(): Promise<JobBoardSourceRow[]> {
  return repo().listAll();
}

/** A source that can be scraped now wakes the :00/:30 scrape. */
async function signalIfActive(row: JobBoardSourceRow): Promise<JobBoardSourceRow> {
  if (row.isActive) await signalScrapeSourcesActive();
  return row;
}

export async function createGlobalJobSource(input: JobSourceInput, userId: string | null | undefined): Promise<JobBoardSourceRow> {
  return signalIfActive(await repo().insert(toInsert(input, userId, "global")));
}

export async function updateJobSource(id: string, body: unknown): Promise<JobBoardSourceRow> {
  const updated = await repo().update(id, buildPatch(body, true));
  if (!updated) throw notFound();
  return signalIfActive(updated);
}

export function deleteJobSource(id: string): Promise<void> {
  return repo().delete(id);
}

export async function getJobSourceOrThrow(id: string): Promise<JobBoardSourceRow> {
  const source = await repo().findById(id);
  if (!source) throw notFound();
  return source;
}

export function listJobSourceSyncLogs(sourceId: string): Promise<JobBoardSyncLogRow[]> {
  return repo().listSyncLogs(sourceId, 50);
}

// ── a user's own sources ────────────────────────────────────────────────────

export function listMyJobSources(userId: string): Promise<JobBoardSourceRow[]> {
  return repo().listByCreator(userId);
}

export async function createMyJobSource(userId: string, input: JobSourceInput): Promise<JobBoardSourceRow> {
  const r = repo();
  if ((await r.countByCreator(userId)) >= MAX_CUSTOM_SOURCES_PER_USER) {
    throw new DomainError(429, "LIMIT_EXCEEDED", `Maximum of ${MAX_CUSTOM_SOURCES_PER_USER} custom job sources per user`);
  }
  return signalIfActive(await r.insert(toInsert(input, userId, "recruiter")));
}

export async function updateMyJobSource(userId: string, id: string, body: unknown): Promise<JobBoardSourceRow> {
  const updated = await repo().update(id, buildPatch(body, false), userId);
  if (!updated) throw notFound();
  return signalIfActive(updated);
}

export function deleteMyJobSource(userId: string, id: string): Promise<void> {
  return repo().delete(id, userId);
}
