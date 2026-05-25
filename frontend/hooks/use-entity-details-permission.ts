/**
 * use-entity-details-permission.ts — single seam for "can this viewer see
 * the [🌐 Details] drawer for entity X?" Every <EntityDetailsSheet>
 * adapter calls this hook with `{ kind, entity }`. The hook delegates
 * to the appropriate per-entity permission rule and exposes a uniform
 * `canViewStats` field so the drawer chrome stays kind-agnostic.
 *
 * Per the DRY rule, callers do NOT inline `isOwner || isRecruiter`
 * derivations — that scatter is the symptom this hook closes.
 *
 * Owner-only rule: the [🌐 Details] drawer is gated to the artifact
 * owner (admin / super-admin preserved for support, same pattern as
 * every other permission hook). Recruiters and employers do NOT see
 * the drawer on someone else's resume/company/etc. — the per-entity
 * hooks expose a wider `canViewStats` for inline surfaces (e.g.
 * ResumeCard score chips), but the globe drawer is the strict surface
 * and this aggregator enforces the tighter rule. Jobs are the
 * exception: the "owner" of a job posting is the whole company team
 * (backend-stamped `viewerCanManage`), so we delegate to `canEdit`.
 *
 * Adding a new artifact kind: extend EntityDetailsPermissionArgs with
 * the new kind + its row shape, then add a `case` here that returns
 * `{ canViewStats: <hook>.isOwner || adminLike }`. No drawer site
 * changes.
 */

import { useResumePermissions } from "@/hooks/use-resume-permissions";
import { useJobPermissions } from "@/hooks/use-job-permissions";
import { useCompanyPermissions } from "@/hooks/use-company-permissions";
import { useProfilePermissions } from "@/hooks/use-profile-permissions";
import { useArticlePermissions } from "@/hooks/use-article-permissions";
import { useStudioTemplatePermissions } from "@/hooks/use-studio-template-permissions";
import { useServicePermissions } from "@/hooks/use-service-permissions";
import { usePermissions } from "@/hooks/use-permissions";
import type { Resume } from "@/types/resume";

export interface EntityDetailsPermission {
  canViewStats: boolean;
}

export interface ResumeArg { kind: "resume"; entity: Resume | null | undefined; }
export interface JobArg { kind: "job"; entity: { id: string; userId?: string; viewerCanManage?: boolean } | null | undefined; }
export interface CompanyArg { kind: "company"; entity: { id: string; ownerUserId?: string | null } | null | undefined; }
export interface ProfileArg { kind: "profile"; entity: { id: string } | null | undefined; }
export interface ArticleArg { kind: "article"; entity: { id: string; authorId?: string } | null | undefined; }
export interface StudioTemplateArg { kind: "studio_template"; entity: { id: string; creatorUserId?: string | null } | null | undefined; }
export interface ServiceArg { kind: "service"; entity: { id: string; providerUserId?: string | null } | null | undefined; }
export interface VideoArg { kind: "video"; entity: { id: string; userId?: string | null } | null | undefined; }

export type EntityDetailsPermissionArgs =
  | ResumeArg
  | JobArg
  | CompanyArg
  | ProfileArg
  | ArticleArg
  | StudioTemplateArg
  | ServiceArg
  | VideoArg;

export function useEntityDetailsPermission(
  args: EntityDetailsPermissionArgs,
): EntityDetailsPermission {
  // All branch hooks must be called unconditionally to satisfy React's
  // rules-of-hooks contract. Each per-entity hook accepts a null entity
  // and returns an all-false permissions object in that case, so feeding
  // a non-matching entity is safe.
  const { isAdmin, isSuperAdmin } = usePermissions();
  const adminLike = isAdmin || isSuperAdmin;

  const resume = useResumePermissions(args.kind === "resume" ? args.entity : null);
  const job = useJobPermissions(args.kind === "job" ? args.entity ?? null : null);
  const company = useCompanyPermissions(args.kind === "company" ? args.entity ?? null : null);
  const profile = useProfilePermissions(args.kind === "profile" ? args.entity ?? null : null);
  const article = useArticlePermissions(args.kind === "article" ? args.entity ?? null : null);
  const template = useStudioTemplatePermissions(args.kind === "studio_template" ? args.entity ?? null : null);
  const service = useServicePermissions(args.kind === "service" ? args.entity ?? null : null);
  const video = useStudioTemplatePermissions(args.kind === "video" ? (args.entity as any) : null);

  switch (args.kind) {
    case "resume": return { canViewStats: resume.isOwner || adminLike };
    case "job": return { canViewStats: job.canEdit || adminLike };
    case "company": return { canViewStats: company.isOwner || adminLike };
    case "profile": return { canViewStats: profile.isOwner || adminLike };
    case "article": return { canViewStats: article.isOwner || adminLike };
    case "studio_template": return { canViewStats: template.isOwner || adminLike };
    case "service": return { canViewStats: service.isOwner || adminLike };
    case "video": return { canViewStats: video.isOwner || adminLike };
  }
}
