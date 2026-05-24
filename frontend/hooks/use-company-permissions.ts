/**
 * use-company-permissions.ts — viewer-scoped permissions for a single
 * company. Mirrors the rule shape of use-resume-permissions / use-job-
 * permissions so the unified `useEntityDetailsPermission` can delegate
 * to it without surprises.
 *
 * Today only `canViewStats` is needed by the [🌐 Details] drawer.
 * Additional `canX` fields should be added here as the drawer grows.
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface CompanyLike {
  id: string;
  ownerUserId?: string | null;
  /** Backend-stamped fast-path used by the recruiter/employer
   *  workspace — if present, treat as canonical "viewer can manage". */
  viewerCanManage?: boolean;
}

interface CompanyPermissions {
  isOwner: boolean;
  canViewStats: boolean;
}

const NULL: CompanyPermissions = { isOwner: false, canViewStats: false };

export function useCompanyPermissions(
  company: CompanyLike | null | undefined,
): CompanyPermissions {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, canManageJobs } = usePermissions();

  if (!company) return NULL;
  const isOwner = Boolean(
    user?.id && company.ownerUserId && user.id === company.ownerUserId,
  );
  const adminLike = isOwner || isAdmin || isSuperAdmin || !!company.viewerCanManage;
  return {
    isOwner,
    // Owner + admins always; hiring-side viewers see metrics on
    // companies they're recruiting against, mirroring the resume rule.
    canViewStats: adminLike || canManageJobs,
  };
}
