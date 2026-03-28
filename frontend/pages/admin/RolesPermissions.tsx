import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ROLES = ["JobSeeker", "Affiliate", "Recruiter", "Employer", "Admin", "SuperAdmin"] as const;

const ROLE_LABELS: Record<string, string> = {
  JobSeeker:  "Job Seeker",
  Affiliate:  "Affiliate",
  Recruiter:  "Recruiter",
  Employer:   "Employer",
  Admin:      "Admin",
  SuperAdmin: "Super Admin",
};

const PERMISSION_GROUPS = [
  {
    group: "Content",
    permissions: [
      { key: "viewJobs",       label: "View Jobs" },
      { key: "postJobs",       label: "Post Jobs" },
      { key: "manageJobs",     label: "Manage All Jobs" },
      { key: "viewResumes",    label: "View Resumes" },
      { key: "manageResumes",  label: "Manage All Resumes" },
      { key: "viewCompanies",  label: "View Companies" },
      { key: "manageCompanies",label: "Manage Companies" },
    ],
  },
  {
    group: "Recruiting",
    permissions: [
      { key: "searchCandidates",  label: "Search Candidates" },
      { key: "contactCandidates", label: "Contact Candidates" },
      { key: "manageApplications",label: "Manage Applications" },
      { key: "viewAnalytics",     label: "View Analytics" },
    ],
  },
  {
    group: "Platform",
    permissions: [
      { key: "accessAdmin",    label: "Access Admin Panel" },
      { key: "manageUsers",    label: "Manage Users" },
      { key: "manageRoles",    label: "Manage Roles" },
      { key: "manageBilling",  label: "Manage Billing" },
      { key: "viewAuditLog",   label: "View Audit Log" },
      { key: "manageModules",  label: "Manage Modules" },
      { key: "impersonateUser",label: "Impersonate Users" },
    ],
  },
];

// Permission matrix — which roles have which permissions
const MATRIX: Record<string, Record<string, boolean>> = {
  viewJobs:           { JobSeeker: true,  Affiliate: true,  Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  postJobs:           { JobSeeker: false, Affiliate: false, Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  manageJobs:         { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: true,  SuperAdmin: true  },
  viewResumes:        { JobSeeker: false, Affiliate: false, Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  manageResumes:      { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: true,  SuperAdmin: true  },
  viewCompanies:      { JobSeeker: true,  Affiliate: true,  Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  manageCompanies:    { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: true,  Admin: true,  SuperAdmin: true  },
  searchCandidates:   { JobSeeker: false, Affiliate: false, Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  contactCandidates:  { JobSeeker: false, Affiliate: false, Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  manageApplications: { JobSeeker: true,  Affiliate: false, Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  viewAnalytics:      { JobSeeker: false, Affiliate: true,  Recruiter: true,  Employer: true,  Admin: true,  SuperAdmin: true  },
  accessAdmin:        { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: true,  SuperAdmin: true  },
  manageUsers:        { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: false, SuperAdmin: true  },
  manageRoles:        { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: false, SuperAdmin: true  },
  manageBilling:      { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: false, SuperAdmin: true  },
  viewAuditLog:       { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: true,  SuperAdmin: true  },
  manageModules:      { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: false, SuperAdmin: true  },
  impersonateUser:    { JobSeeker: false, Affiliate: false, Recruiter: false, Employer: false, Admin: false, SuperAdmin: true  },
};

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin: "text-purple-700 dark:text-purple-300",
  Admin:      "text-blue-700 dark:text-blue-300",
  Employer:   "text-green-700 dark:text-green-300",
  Recruiter:  "text-yellow-700 dark:text-yellow-300",
  JobSeeker:  "text-gray-700 dark:text-gray-300",
  Affiliate:  "text-orange-700 dark:text-orange-300",
};

export default function RolesPermissions() {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const grantCount = (role: string) =>
    Object.values(MATRIX).filter((m) => m[role]).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roles & Permissions</h1>
        <p className="text-muted-foreground text-sm">Permission matrix for all platform roles. Full editing coming soon.</p>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ROLES.map((role) => (
          <Card
            key={role}
            className={cn(
              "cursor-pointer transition-all border-2",
              highlighted === role ? "border-primary" : "border-transparent hover:border-muted-foreground/30",
            )}
            onClick={() => setHighlighted(highlighted === role ? null : role)}
          >
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-xs font-semibold ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</p>
              <p className="text-2xl font-bold mt-1">{grantCount(role)}</p>
              <p className="text-[10px] text-muted-foreground">permissions</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permission matrix */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Permission Matrix</CardTitle>
          <CardDescription>Click a role card above to highlight its column.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-48">Permission</th>
                  {ROLES.map((role) => (
                    <th
                      key={role}
                      className={cn(
                        "px-3 py-2 text-center font-medium text-xs",
                        highlighted === role ? "bg-primary/10" : "",
                        ROLE_COLORS[role],
                      )}
                    >
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map(({ group, permissions }) => (
                  <React.Fragment key={group}>
                    <tr className="bg-muted/40">
                      <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {group}
                      </td>
                    </tr>
                    {permissions.map(({ key, label }) => (
                      <tr key={key} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-2 text-sm">{label}</td>
                        {ROLES.map((role) => (
                          <td
                            key={role}
                            className={cn(
                              "px-3 py-2 text-center",
                              highlighted === role ? "bg-primary/10" : "",
                            )}
                          >
                            {MATRIX[key]?.[role] ? (
                              <Check className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
