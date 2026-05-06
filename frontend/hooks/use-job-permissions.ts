import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";

interface JobPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  loading: boolean;
}

interface Job {
  id: string;
  userId?: string;
  createdByUser?: {
    userId?: string;
  };
  // Add other job properties as needed
}

export function useJobPermissions(job: Job | null): JobPermissions {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<JobPermissions>({
    canEdit: false,
    canDelete: false,
    canView: true, // Most jobs are viewable
    loading: true,
  });

  useEffect(() => {
    if (!job) {
      setPermissions({
        canEdit: false,
        canDelete: false,
        canView: false,
        loading: false,
      });
      return;
    }

    if (!user) {
      setPermissions({
        canEdit: false,
        canDelete: false,
        canView: true, // Public jobs can be viewed without auth
        loading: false,
      });
      return;
    }

    // Use centralized role permissions
    const rolePermissions = createRolePermissions(user.role);

    // Check if user is the job creator
    const isJobCreator =
      job.userId === user.id || job.createdByUser?.userId === user.id;

    let canEdit = false;
    let canDelete = false;

    if (isJobCreator) {
      // Job creator can always edit and delete their own jobs
      canEdit = true;
      canDelete = true;
    } else {
      // Non-creators: only platform admins can edit / delete arbitrary jobs.
      // Recruiter / employer roles do NOT grant cross-tenant edit rights —
      // an employer at company A must not be able to edit a job posted by
      // company B just because they share a role.
      canEdit = rolePermissions.isAdmin || rolePermissions.isSuperAdmin;
      canDelete = rolePermissions.isAdmin || rolePermissions.isSuperAdmin;
    }

    setPermissions({
      canEdit,
      canDelete,
      canView: true,
      loading: false,
    });
  }, [job, user]);

  return permissions;
}

/**
 * Whether the viewer can manage the recruiter pipeline for a job
 * (Candidates kanban + Reports). True only when the viewer owns the job
 * or is a platform admin — wearing a recruiter / employer hat is not
 * enough on its own, otherwise any employer would see the candidate
 * pipeline of any other employer's job. Used by the pipeline panels to
 * self-gate (return null when not entitled) so JobDetail no longer
 * prop-drills a `canManagePipeline` boolean.
 */
export function useCanManageJobPipeline(jobOwnerId?: string | null): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (jobOwnerId && user.id === jobOwnerId) return true;
  const role = createRolePermissions(user.role);
  return role.isAdmin || role.isSuperAdmin;
}

