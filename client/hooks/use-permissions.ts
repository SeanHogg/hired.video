import { useMemo } from 'react';
import { useAuth, USER_ROLES } from '@/lib/auth';

export function usePermissions() {
  const { user } = useAuth();
  const userRole = user?.role;

  // Simple role checks
  const isAdmin = useMemo(() => userRole === USER_ROLES.ADMIN, [userRole]);
  const isBusiness = useMemo(() => userRole === USER_ROLES.BUSINESS, [userRole]);
  const isRecruiter = useMemo(() => userRole === USER_ROLES.RECRUITER, [userRole]);
  const isJobSeeker = useMemo(() => userRole === USER_ROLES.JOB_SEEKER, [userRole]);

  // Permission checks
  const canManageAccount = useMemo(() => isAdmin || isBusiness, [isAdmin, isBusiness]);
  const canManageJobs = useMemo(() => isAdmin || isBusiness || isRecruiter, [isAdmin, isBusiness, isRecruiter]);
  const canViewResumes = useMemo(() => isAdmin || isBusiness || isRecruiter, [isAdmin, isBusiness, isRecruiter]);
  const canCreateResume = useMemo(() => isJobSeeker, [isJobSeeker]);

  return {
    userRole,
    isAdmin,
    isBusiness,
    isRecruiter,
    isJobSeeker,
    canManageAccount,
    canManageJobs,
    canViewResumes,
    canCreateResume,
  };
}
