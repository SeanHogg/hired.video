import React, { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { MyVideoResumeRole } from '@/types/account';

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
}

export interface RolePermissions {
  role: MyVideoResumeRole;
  permissions: Permission[];
  description: string;
  hierarchy: number; // Higher number = more permissions
}

// Define role hierarchy and permissions
const ROLE_PERMISSIONS: RolePermissions[] = [
  {
    role: MyVideoResumeRole.AccountOwner,
    hierarchy: 100,
    description: 'Full access to all features and settings',
    permissions: [
      // Account management
      { resource: 'account', action: 'manage' },
      { resource: 'billing', action: 'manage' },
      { resource: 'subscription', action: 'manage' },
      
      // Team management
      { resource: 'team', action: 'manage' },
      { resource: 'team_members', action: 'create' },
      { resource: 'team_members', action: 'read' },
      { resource: 'team_members', action: 'update' },
      { resource: 'team_members', action: 'delete' },
      { resource: 'roles', action: 'manage' },
      
      // Job management
      { resource: 'jobs', action: 'create' },
      { resource: 'jobs', action: 'read' },
      { resource: 'jobs', action: 'update' },
      { resource: 'jobs', action: 'delete' },
      { resource: 'job_applications', action: 'read' },
      { resource: 'job_applications', action: 'update' },
      
      // Resume management
      { resource: 'resumes', action: 'read' },
      { resource: 'resume_analytics', action: 'read' },
      
      // Company management
      { resource: 'company', action: 'manage' },
      { resource: 'company_branding', action: 'manage' },
      
      // Analytics and reporting
      { resource: 'analytics', action: 'read' },
      { resource: 'reports', action: 'create' },
      { resource: 'reports', action: 'read' },
      
      // Communication
      { resource: 'messages', action: 'create' },
      { resource: 'messages', action: 'read' },
      { resource: 'email_templates', action: 'manage' },
      { resource: 'campaigns', action: 'manage' },
    ]
  },
  {
    role: MyVideoResumeRole.AccountAdmin,
    hierarchy: 80,
    description: 'Administrative access with team and job management',
    permissions: [
      // Team management (limited)
      { resource: 'team_members', action: 'create' },
      { resource: 'team_members', action: 'read' },
      { resource: 'team_members', action: 'update' },
      { resource: 'roles', action: 'update' }, // Can assign roles but not manage role definitions
      
      // Job management
      { resource: 'jobs', action: 'create' },
      { resource: 'jobs', action: 'read' },
      { resource: 'jobs', action: 'update' },
      { resource: 'jobs', action: 'delete' },
      { resource: 'job_applications', action: 'read' },
      { resource: 'job_applications', action: 'update' },
      
      // Resume management
      { resource: 'resumes', action: 'read' },
      { resource: 'resume_analytics', action: 'read' },
      
      // Company management (limited)
      { resource: 'company', action: 'update' },
      
      // Analytics and reporting
      { resource: 'analytics', action: 'read' },
      { resource: 'reports', action: 'read' },
      
      // Communication
      { resource: 'messages', action: 'create' },
      { resource: 'messages', action: 'read' },
      { resource: 'email_templates', action: 'create' },
      { resource: 'email_templates', action: 'read' },
      { resource: 'email_templates', action: 'update' },
      { resource: 'campaigns', action: 'create' },
      { resource: 'campaigns', action: 'read' },
    ]
  },
  {
    role: MyVideoResumeRole.Recruiter,
    hierarchy: 60,
    description: 'Job posting and candidate management access',
    permissions: [
      // Job management
      { resource: 'jobs', action: 'create' },
      { resource: 'jobs', action: 'read' },
      { resource: 'jobs', action: 'update' },
      { resource: 'job_applications', action: 'read' },
      { resource: 'job_applications', action: 'update' },
      
      // Resume management
      { resource: 'resumes', action: 'read' },
      
      // Limited analytics
      { resource: 'analytics', action: 'read' }, // Only job-related analytics
      
      // Communication
      { resource: 'messages', action: 'create' },
      { resource: 'messages', action: 'read' },
      { resource: 'email_templates', action: 'read' },
      { resource: 'campaigns', action: 'read' },
      
      // Team (read-only)
      { resource: 'team_members', action: 'read' },
    ]
  },
  {
    role: MyVideoResumeRole.JobSeeker,
    hierarchy: 20,
    description: 'Personal resume and job search access',
    permissions: [
      // Own resume management
      { resource: 'own_resumes', action: 'create' },
      { resource: 'own_resumes', action: 'read' },
      { resource: 'own_resumes', action: 'update' },
      { resource: 'own_resumes', action: 'delete' },
      
      // Job search
      { resource: 'jobs', action: 'read' },
      { resource: 'job_applications', action: 'create' },
      { resource: 'own_job_applications', action: 'read' },
      { resource: 'own_job_applications', action: 'update' },
      
      // Communication (limited)
      { resource: 'messages', action: 'read' },
      { resource: 'messages', action: 'create' }, // Can respond to messages
      
      // Own analytics
      { resource: 'own_analytics', action: 'read' },
    ]
  }
];

export function usePermissions() {
  const { user } = useAuth();

  const userRole = user?.role as unknown as MyVideoResumeRole;
  
  const rolePermissions = useMemo(() => {
    if (!userRole) return null;
    return ROLE_PERMISSIONS.find(rp => rp.role === userRole) || null;
  }, [userRole]);

  const hasPermission = useMemo(() => {
    return (resource: string, action: 'create' | 'read' | 'update' | 'delete' | 'manage') => {
      if (!rolePermissions) return false;
      
      // Check for exact permission match
      const hasExactPermission = rolePermissions.permissions.some(
        p => p.resource === resource && p.action === action
      );
      
      if (hasExactPermission) return true;
      
      // Check for 'manage' permission which includes all actions
      const hasManagePermission = rolePermissions.permissions.some(
        p => p.resource === resource && p.action === 'manage'
      );
      
      return hasManagePermission;
    };
  }, [rolePermissions]);

  const canAccessResource = useMemo(() => {
    return (resource: string) => {
      if (!rolePermissions) return false;
      
      return rolePermissions.permissions.some(p => p.resource === resource);
    };
  }, [rolePermissions]);

  const hasAnyRole = useMemo(() => {
    return (roles: MyVideoResumeRole[]) => {
      if (!userRole) return false;
      return roles.includes(userRole);
    };
  }, [userRole]);

  const hasMinimumRole = useMemo(() => {
    return (minimumRole: MyVideoResumeRole) => {
      if (!userRole) return false;
      
      const userRoleData = ROLE_PERMISSIONS.find(rp => rp.role === userRole);
      const minimumRoleData = ROLE_PERMISSIONS.find(rp => rp.role === minimumRole);
      
      if (!userRoleData || !minimumRoleData) return false;
      
      return userRoleData.hierarchy >= minimumRoleData.hierarchy;
    };
  }, [userRole]);

  const isOwner = useMemo(() => {
    return userRole === MyVideoResumeRole.AccountOwner;
  }, [userRole]);

  const isAdmin = useMemo(() => {
    return hasAnyRole([MyVideoResumeRole.AccountOwner, MyVideoResumeRole.AccountAdmin]);
  }, [hasAnyRole]);

  const isRecruiter = useMemo(() => {
    return hasAnyRole([
      MyVideoResumeRole.AccountOwner, 
      MyVideoResumeRole.AccountAdmin, 
      MyVideoResumeRole.Recruiter
    ]);
  }, [hasAnyRole]);

  const isJobSeeker = useMemo(() => {
    return userRole === MyVideoResumeRole.JobSeeker;
  }, [userRole]);

  // Specific permission checks for common use cases
  const permissions = useMemo(() => ({
    // Team management
    canInviteUsers: hasPermission('team_members', 'create'),
    canManageTeam: hasPermission('team', 'manage'),
    canViewTeam: hasPermission('team_members', 'read'),
    canEditTeamMembers: hasPermission('team_members', 'update'),
    canRemoveTeamMembers: hasPermission('team_members', 'delete'),
    canManageRoles: hasPermission('roles', 'manage'),
    canAssignRoles: hasPermission('roles', 'update'),
    
    // Job management
    canCreateJobs: hasPermission('jobs', 'create'),
    canEditJobs: hasPermission('jobs', 'update'),
    canDeleteJobs: hasPermission('jobs', 'delete'),
    canViewJobs: hasPermission('jobs', 'read'),
    canManageApplications: hasPermission('job_applications', 'update'),
    
    // Company management
    canManageCompany: hasPermission('company', 'manage'),
    canEditCompany: hasPermission('company', 'update'),
    canManageBranding: hasPermission('company_branding', 'manage'),
    
    // Billing and subscription
    canManageBilling: hasPermission('billing', 'manage'),
    canManageSubscription: hasPermission('subscription', 'manage'),
    canViewBilling: hasPermission('billing', 'read'),
    
    // Analytics and reporting
    canViewAnalytics: hasPermission('analytics', 'read'),
    canCreateReports: hasPermission('reports', 'create'),
    
    // Communication
    canSendMessages: hasPermission('messages', 'create'),
    canManageTemplates: hasPermission('email_templates', 'manage'),
    canCreateTemplates: hasPermission('email_templates', 'create'),
    canManageCampaigns: hasPermission('campaigns', 'manage'),
    
    // Resume access
    canViewResumes: hasPermission('resumes', 'read'),
    canViewResumeAnalytics: hasPermission('resume_analytics', 'read'),
  }), [hasPermission]);

  return {
    userRole,
    rolePermissions,
    hasPermission,
    canAccessResource,
    hasAnyRole,
    hasMinimumRole,
    isOwner,
    isAdmin,
    isRecruiter,
    isJobSeeker,
    permissions,
    allRoles: ROLE_PERMISSIONS
  };
}

// Helper component for conditional rendering based on permissions
export function PermissionGate({ 
  resource, 
  action, 
  fallback = null, 
  children 
}: {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasPermission } = usePermissions();
  
  if (hasPermission(resource, action)) {
    return React.createElement(React.Fragment, null, children);
  }

  return React.createElement(React.Fragment, null, fallback);
}

// Helper component for role-based rendering
export function RoleGate({ 
  roles, 
  fallback = null, 
  children 
}: {
  roles: MyVideoResumeRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasAnyRole } = usePermissions();
  
  if (hasAnyRole(roles)) {
    return React.createElement(React.Fragment, null, children);
  }

  return React.createElement(React.Fragment, null, fallback);
}
