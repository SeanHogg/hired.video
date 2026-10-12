/**
 * Saving a kit review — the one place that decides WHERE it goes:
 *
 *   open résumé is a version   → saved over it, in place (one undo step,
 *                                 autosaved; the workspace and its steps stay)
 *   master / standalone / new  → a new version of the master (lineage rules
 *                                 server-side); it opens with this session
 *
 * Confirmed gap answers go to the master when asked. Shared by tailor,
 * create-from-a-job (`saveReviewedResume`) and merge's explicit "Save as a
 * version of master" (`saveVersionOfMaster`).
 */
import type { ResumeContent } from "@shared/resume";
import type { ConfirmedFact } from "@shared/resume-tailor";
import { resumeVersionsService } from "@/lib/services/resume-versions-service";
import { carryDraftSession } from "../use-draft-scoped-state";
import type { ReviewHost } from "./review-model";

interface SaveArgs {
  content: ResumeContent;
  title: string;
  facts?: readonly ConfirmedFact[];
  alsoMaster?: boolean;
}

/** The open résumé is already a version: a review saves over it. */
export function savesInPlace(host: ReviewHost): boolean {
  return !!host.resumeId && host.lineage?.resumeId === host.resumeId && host.lineage.role === "version";
}

/** The primary button's i18n key for a tailor / create-from-a-job review. */
export function saveLabelKey(host: ReviewHost): string {
  return savesInPlace(host) ? "review.saveToVersion" : "review.saveVersion";
}

async function addFacts(args: SaveArgs): Promise<void> {
  if (args.alsoMaster && args.facts?.length) await resumeVersionsService.addToMaster(args.facts);
}

/** Always a NEW version of the master, opened in the workspace. */
export async function saveVersionOfMaster(host: ReviewHost, args: SaveArgs): Promise<void> {
  const sourceId = host.resumeId ?? (await host.ensureSaved());
  const saved = await resumeVersionsService.saveVersion(sourceId, { content: args.content, title: args.title });
  await addFacts(args);
  carryDraftSession(sourceId, saved.resumeId);
  host.openResume(args.content, saved.title, saved.resumeId);
  host.refreshLineage();
}

/** Over the open version when it is one, else a new version of the master. */
export async function saveReviewedResume(host: ReviewHost, args: SaveArgs): Promise<void> {
  if (!savesInPlace(host)) return saveVersionOfMaster(host, args);
  host.commit(args.content);
  await addFacts(args);
  host.refreshLineage();
}
