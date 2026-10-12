/**
 * "Your kits" on the studio home: one row per résumé with its cover letter
 * and its video, matched IN MEMORY from two lists the home already loads
 * (the résumé list — with `hasCoverLetter` — and the studio projects; a
 * kit's video carries the résumé's `resume_video` link). No per-row fetch.
 * The video a row shows is the kit's, so the general project list leaves
 * it out (useKitRows).
 */
import { kitResumeId } from "@shared/studio-subject";

interface ResumeRow {
  id?: string | null;
  title?: string | null;
  isMaster?: boolean | null;
  hasCoverLetter?: boolean | null;
  updatedAt?: string;
}

interface ProjectRow {
  id: string;
  subjects?: readonly { kind: string; id: string }[] | null;
  status?: string | null;
  /** Distinct channels it's published to (list read). */
  publicationCount?: number | null;
  updateDateTime: string;
}

export interface KitRow {
  resumeId: string;
  title: string;
  isMaster: boolean;
  hasLetter: boolean;
  /** `channels` = distinct destinations it's posted to (0 = unknown/none). */
  video: { projectId: string; posted: boolean; channels: number } | null;
  /** The newest of the résumé's and its video's edits (ISO). */
  updatedAt: string;
}

/** The kit's address: its project, else the résumé resolver. */
export function kitHref(row: KitRow): string {
  return row.video ? `/studio/${encodeURIComponent(row.video.projectId)}` : `/studio/resume/${encodeURIComponent(row.resumeId)}`;
}

/** A project is posted when Published OR live on any channel (a YouTube /
 *  LinkedIn post records a publication without flipping the status). The ONE
 *  rule for "Posted" on the studio home — kit videos and other projects. */
export function isProjectPosted(project: Pick<ProjectRow, "status" | "publicationCount">): boolean {
  return project.status === "Published" || (project.publicationCount ?? 0) > 0;
}

function kitVideo(project: ProjectRow): NonNullable<KitRow["video"]> {
  const channels = Math.max(0, project.publicationCount ?? 0);
  return { projectId: project.id, posted: isProjectPosted(project), channels };
}

export function buildKitRows(resumes: readonly ResumeRow[], projects: readonly ProjectRow[], untitled: string): KitRow[] {
  // Newest video per résumé (a résumé has ONE, but older duplicates exist).
  const videoOf = new Map<string, ProjectRow>();
  for (const project of projects) {
    const resumeId = kitResumeId(project.subjects);
    if (!resumeId) continue;
    const seen = videoOf.get(resumeId);
    if (!seen || project.updateDateTime > seen.updateDateTime) videoOf.set(resumeId, project);
  }
  const rows: KitRow[] = [];
  for (const resume of resumes) {
    if (!resume.id) continue;
    const video = videoOf.get(resume.id) ?? null;
    const updated = [resume.updatedAt ?? "", video?.updateDateTime ?? ""].sort().pop() ?? "";
    rows.push({
      resumeId: resume.id,
      title: resume.title?.trim() || untitled,
      isMaster: resume.isMaster === true,
      hasLetter: resume.hasCoverLetter === true,
      video: video ? kitVideo(video) : null,
      updatedAt: updated,
    });
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
