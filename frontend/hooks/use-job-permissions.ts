import { useAuth } from "@/lib/auth";

interface JobPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  /** Whether the viewer can manage the recruiter pipeline (Candidates
   *  kanban + Reports). Same backend rule as canEdit — exposed
   *  separately so the JobDetail tab strip can self-gate without
   *  re-deriving anything. */
  canManagePipeline: boolean;
}

interface Job {
  id: string;
  userId?: string;
  createdByUser?: {
    userId?: string;
  };
  /** Backend-stamped "can this viewer manage?" verdict — see
   *  `requireJobOwner` / `canViewerManageJob` for the canonical rule
   *  (owner / super-admin / company team member). */
  viewerCanManage?: boolean;
}

/**
 * Single source of truth for job-management gating on the frontend.
 *
 * Reads the backend-authoritative `viewerCanManage` flag stamped on the
 * job DTO. Owner check is kept as a local fast-path so the UI doesn't
 * flicker for the obvious case while waiting on the network — but the
 * substantive rule (super-admin, company team member, etc.) lives in
 * `canViewerManageJob` on the backend and is mirrored here without
 * re-derivation. Drift between frontend role checks and backend rules
 * was the root cause of non-owners seeing Edit Job + Candidates/Reports
 * and then 403-ing on `/pipeline`.
 */
export function useJobPermissions(job: Job | null): JobPermissions {
  const { user } = useAuth();

  if (!job) {
    return { canEdit: false, canDelete: false, canView: false, canManagePipeline: false };
  }

  if (!user) {
    return { canEdit: false, canDelete: false, canView: true, canManagePipeline: false };
  }

  const isJobCreator =
    (job.userId && job.userId === user.id) ||
    (job.createdByUser?.userId && job.createdByUser.userId === user.id);

  const canManage = isJobCreator || job.viewerCanManage === true;

  return {
    canEdit: canManage,
    canDelete: canManage,
    canView: true,
    canManagePipeline: canManage,
  };
}

/**
 * Convenience hook for the pipeline panels (`JobPipelineKanban`,
 * `JobPipelineReports`) so they self-gate without taking the full job
 * object as a prop. Mirrors the same rule as `useJobPermissions` —
 * backend `viewerCanManage` plus owner fast-path. The pipeline panels
 * pass the relevant fields from their parent's already-loaded job; we
 * deliberately do NOT consult `user.role` here so the gate cannot drift
 * from the backend.
 */
export function useCanManageJobPipeline(
  jobOwner: { userId?: string | null; viewerCanManage?: boolean } | null | undefined,
): boolean {
  const { user } = useAuth();
  if (!user || !jobOwner) return false;
  if (jobOwner.userId && user.id === jobOwner.userId) return true;
  return jobOwner.viewerCanManage === true;
}

