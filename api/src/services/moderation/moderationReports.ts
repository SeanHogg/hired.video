/**
 * moderationReports.ts — use cases behind /api/moderation/reports. Binds the
 * DB-backed deps so the route never touches getDb()/drizzle; filing and
 * resolving delegate to moderationService (notifications + inbox fan-out).
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import {
  ContentReportsRepository,
  type ReportStatus,
} from "../../repositories/contentReportsRepository.js";
import {
  fileReport,
  resolveReport,
  type FileReportInput,
  type ResolveReportInput,
} from "./moderationService.js";

export function submitContentReport(input: FileReportInput) {
  return fileReport({ repos: buildRepos(getDb()) }, input);
}

export function resolveContentReport(input: ResolveReportInput) {
  return resolveReport({ repos: buildRepos(getDb()) }, input);
}

export function listMyContentReports(reporterId: string) {
  return new ContentReportsRepository(getDb()).listForReporter(reporterId);
}

export function listContentReportQueue(status: ReportStatus | null, limit: number) {
  return new ContentReportsRepository(getDb()).listQueue(status, limit);
}
