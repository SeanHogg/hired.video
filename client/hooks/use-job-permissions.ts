import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";

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

    // Check if user is the job creator
    const isJobCreator = job.userId === user.id || job.createdByUser?.userId === user.id;

    // For now, implement basic permission logic
    // In a full implementation, you would check:
    // 1. User roles (JobSeeker, Recruiter, etc.)
    // 2. Company associations
    // 3. Account ownership
    
    const isRecruiter = user.roles?.includes("Recruiter") || user.roles?.includes("Employer");
    const isJobSeeker = user.roles?.includes("JobSeeker");

    let canEdit = false;
    let canDelete = false;

    if (isJobCreator) {
      // Job creator can always edit and delete their own jobs
      canEdit = true;
      canDelete = true;
    } else if (isRecruiter && !isJobSeeker) {
      // Recruiters might be able to edit jobs in their company
      // This would require additional API calls to check company associations
      // For now, we'll be conservative and not allow editing
      canEdit = false;
      canDelete = false;
    }

    // Job seekers should never be able to edit jobs
    if (isJobSeeker && !isRecruiter) {
      canEdit = false;
      canDelete = false;
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

// Hook for checking if user can create jobs
export function useCanCreateJobs(): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  // Only recruiters and employers can create jobs, not job seekers
  const isRecruiter = user.roles?.includes("Recruiter") || user.roles?.includes("Employer");
  const isJobSeeker = user.roles?.includes("JobSeeker");
  
  return isRecruiter && !isJobSeeker;
}

// Enhanced hook that could make API calls to check permissions
export function useJobPermissionsWithAPI(jobId: string | null): JobPermissions {
  const [permissions, setPermissions] = useState<JobPermissions>({
    canEdit: false,
    canDelete: false,
    canView: true,
    loading: true,
  });

  useEffect(() => {
    if (!jobId) {
      setPermissions(prev => ({ ...prev, loading: false }));
      return;
    }

    // In a full implementation, you would make an API call here
    // to check permissions on the server side
    // Example:
    // const checkPermissions = async () => {
    //   try {
    //     const response = await apiClient.get(`/api/Job/${jobId}/permissions`);
    //     setPermissions({
    //       ...response.data,
    //       loading: false,
    //     });
    //   } catch (error) {
    //     setPermissions({
    //       canEdit: false,
    //       canDelete: false,
    //       canView: false,
    //       loading: false,
    //     });
    //   }
    // };
    // checkPermissions();

    // For now, just set loading to false
    setPermissions(prev => ({ ...prev, loading: false }));
  }, [jobId]);

  return permissions;
}
