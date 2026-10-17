/**
 * Public studio video rails (no auth required; an authed owner / workspace
 * editor also sees their drafts for pre-publish QA): a user's profile rail,
 * a résumé's rail, the home-page featured carousel, a subject's public
 * project list, and the embed snippet. Every rail returns the PROJECT id —
 * `/api/studio/public/:videoId` accepts project ids, so
 * <StudioVideoSurface mode="lazy"/> hydrates whether or not a render exists.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { cdnUrl } from "../../utils/cdn.js";
import {
  findCreditedProjectIds,
  findVideoForEmbed,
  listFeaturedRows,
  listProfileRailRows,
  listPublicProjectsForSubject,
  listResumeIdsForUser,
  listResumeRailRows,
  listSubjectLinksForProjects,
} from "../../repositories/studioCatalogRepository.js";
import { asIso, toProjectDto, type StudioProjectDto } from "./project-dto.js";
import { projectStateDto } from "./project-state.js";
import { getPublicProjectsCached } from "./public-projects-cache.js";
import { listAccessibleWorkspaces } from "./workspace.js";

interface StateColumns {
  mediaKind: string | null;
  state: unknown;
}

/** mediaKind + per-kind state fan-out (#1215) every rail item carries —
 *  the public shape predates the single `state` column (0610). */
function stateFanOut(r: StateColumns) {
  const state = projectStateDto(r);
  return {
    mediaKind: r.mediaKind ?? "video",
    timelineSpec: state.timelineSpec,
    gameState: state.gameState,
    imageState: state.imageState,
    animationState: state.animationState,
    cadState: state.cadState,
    comicState: state.comicState,
  };
}

/** "Can the viewer edit this row?" — owner, company member, or delegate. */
async function editPredicate(viewerId: string | undefined) {
  if (!viewerId) return () => false;
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(viewerId);
  return (v: { userId: string; companyId: string | null }) => {
    if (v.userId === viewerId) return true;
    if (v.companyId && companyIds.includes(v.companyId)) return true;
    return v.companyId == null && delegatedSubjectUserIds.includes(v.userId);
  };
}

/** Profile rail: projects the user owns PLUS projects credited to them as a
 *  contributor (creator_credit subjects). Public ones, or the viewer's own
 *  drafts; max 20. `subjectKinds` lists the profile/résumé surfaces each
 *  project is linked to for this user. */
export async function listUserRail(userId: string, viewerId: string | undefined) {
  const db = getDb();
  const rows = await listProfileRailRows(db, userId, await findCreditedProjectIds(db, userId));
  const canEdit = await editPredicate(viewerId);
  const visible = rows.filter((r) => r.isPublic || canEdit(r)).slice(0, 20);

  const projectIds = visible.map((r) => r.projectId);
  const userResumeIds = projectIds.length ? await listResumeIdsForUser(db, userId) : [];
  const subjectKindsByProject = new Map<string, Set<string>>();
  for (const s of await listSubjectLinksForProjects(db, projectIds)) {
    const qualifies =
      (s.subjectKind === "profile" && s.subjectId === userId) ||
      (s.subjectKind === "resume" && userResumeIds.includes(s.subjectId));
    if (!qualifies) continue;
    const set = subjectKindsByProject.get(s.projectId) ?? new Set<string>();
    set.add(s.subjectKind);
    subjectKindsByProject.set(s.projectId, set);
  }

  return visible.map((v) => ({
    id: v.projectId,
    title: v.name ?? v.videoTitle ?? null,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    description: v.description,
    privacyStatus: v.privacyStatus,
    ...stateFanOut(v),
    isProfilePrimary: Boolean(v.isProfilePrimary),
    isCreatorCredit: Boolean(v.isCreatorCredit),
    subjectKinds: Array.from(subjectKindsByProject.get(v.projectId) ?? []),
    createdAt: asIso(v.createdAt),
  }));
}

/** Résumé rail: projects linked to the résumé subject — public ones, or
 *  the viewer's own drafts. */
export async function listResumeRail(resumeId: string, viewerId: string | undefined) {
  const rows = await listResumeRailRows(getDb(), resumeId);
  const canEdit = await editPredicate(viewerId);
  return rows
    .filter((v) => v.isPublic || canEdit(v))
    .map((v) => ({
      id: v.projectId,
      title: v.name ?? v.videoTitle ?? null,
      videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
      youtubeUrl: v.youtubeUrl,
      youtubeVideoId: v.youtubeVideoId,
      thumbnailUrl: v.thumbnailUrl,
      privacyStatus: v.privacyStatus,
      status: v.videoStatus ?? v.projectStatus,
      ...stateFanOut(v),
      isProfilePrimary: v.isProfilePrimary,
      createdAt: asIso(v.createdAt),
    }));
}

/** Home-page hero carousel: SA-featured public projects
 *  (`studio_projects.is_featured`, toggled via the admin featured PATCH). */
export async function listFeaturedVideos() {
  const rows = await listFeaturedRows(getDb());
  return rows.map((r) => ({
    id: r.id,
    title: r.name ?? r.videoTitle ?? `${r.ownerName ?? "Hired.video"} Video`,
    videoUrl: r.youtubeUrl ?? (r.r2Key ? cdnUrl(r.r2Key) : null),
    youtubeUrl: r.youtubeUrl,
    youtubeVideoId: r.youtubeVideoId,
    thumbnailUrl: r.thumbnailUrl,
    description: r.description,
    isFeatured: true,
    ...stateFanOut(r),
    ownerName: r.ownerName,
    resumeId: r.resumeId,
    createdAt: asIso(r.createdAt),
  }));
}

/** A subject's public projects in the full project DTO shape (#323), cached
 *  per subject; every write that can change the list invalidates it. */
export async function listPublicSubjectProjects(subject: { kind: string; id: string }): Promise<StudioProjectDto[]> {
  return getPublicProjectsCached(subject, async () => {
    const { projects, videoById } = await listPublicProjectsForSubject(getDb(), subject);
    // Analytics + subjects omitted — not part of the public card surface.
    return projects.map((p) => toProjectDto(p, p.videoId ? videoById.get(p.videoId) ?? null : null, undefined, []));
  });
}

/** Embeddable <iframe> snippet for a public rendered video. */
export async function buildVideoEmbed(videoId: string, width: number, height: number) {
  const vid = await findVideoForEmbed(getDb(), videoId);
  if (!vid || vid.privacyStatus !== "public") throw new DomainError(404, "NOT_FOUND", "Video not found or not public");
  const videoUrl = vid.youtubeVideoId
    ? `https://www.youtube.com/embed/${vid.youtubeVideoId}`
    : vid.r2Key
      ? cdnUrl(vid.r2Key)
      : null;
  if (!videoUrl) throw new DomainError(404, "NOT_AVAILABLE", "Video not yet available for embed");
  const title = vid.title ?? "Video";
  const embedHtml = `<iframe width="${width}" height="${height}" src="${videoUrl}" title="${title.replace(/"/g, "&quot;")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  const shareUrl = `https://hired.video/video/${videoId}`;
  return { embedHtml, shareUrl, videoUrl, width, height };
}
