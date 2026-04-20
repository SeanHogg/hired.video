import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useAdminPermissions,
  ADMIN_RESOURCES,
  CRUD_LABELS,
  RESOURCE_LABELS,
  type CrudAction,
  type AdminResource,
} from "@/lib/admin-permissions";

// Mirrors the ADMIN_CRUD map in admin-permissions.ts — single source of truth displayed here
const ROLE_CRUD: Record<string, Partial<Record<AdminResource, CrudAction[]>>> = {
  super_admin: {
    dashboard: ["read"],
    users:     ["create", "read", "update", "delete"],
    roles:     ["create", "read", "update", "delete"],
    billing:   ["create", "read", "update", "delete"],
    modules:   ["create", "read", "update", "delete"],
    audit:     ["read"],
    settings:  ["read", "update"],
  },
  admin: {
    dashboard: ["read"],
    users:     ["read"],
    roles:     ["read"],
    audit:     ["read"],
  },
  employer:   {},
  recruiter:  {},
  job_seeker: {},
};

// Canonical snake_case roles (matches shared/user-roles.ts + DB users.role).
// Note: Affiliate is NOT a role — it's a service users opt into. Kept out
// of this enum and any permissions matrix; affiliate status is rendered
// separately (as a badge/tag) on the user management page.
const ROLES = ["job_seeker", "recruiter", "employer", "admin", "super_admin"] as const;
type Role = typeof ROLES[number];

const ROLE_LABELS: Record<Role, string> = {
  job_seeker:  "Job Seeker",
  recruiter:   "Recruiter",
  employer:    "Employer",
  admin:       "Admin",
  super_admin: "Super Admin",
};

const ROLE_COLORS: Record<Role, string> = {
  super_admin: "text-purple-700 dark:text-purple-300",
  admin:       "text-blue-700 dark:text-blue-300",
  employer:    "text-green-700 dark:text-green-300",
  recruiter:   "text-yellow-700 dark:text-yellow-300",
  job_seeker:  "text-gray-700 dark:text-gray-300",
};

const CRUD_COLORS: Record<CrudAction, string> = {
  create: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  read:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  update: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function CrudBadge({ action }: { action: CrudAction }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CRUD_COLORS[action]}`}>
      {action[0].toUpperCase()}
    </span>
  );
}

function totalGrants(role: Role): number {
  const grants = ROLE_CRUD[role] ?? {};
  return Object.values(grants).reduce((sum, actions) => sum + (actions?.length ?? 0), 0);
}

export default function RolesPermissions() {
  const [highlighted, setHighlighted] = useState<Role | null>(null);
  const { can } = useAdminPermissions();
  const canEdit = can("roles", "update");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground text-sm">
            CRUD permission matrix for admin resources across all platform roles.
            {!canEdit && " You have read-only access."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {(["create","read","update","delete"] as CrudAction[]).map((a) => (
            <span key={a} className="flex items-center gap-1 text-xs text-muted-foreground">
              <CrudBadge action={a} /> {CRUD_LABELS[a]}
            </span>
          ))}
        </div>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ROLES.map((role) => (
          <Card
            key={role}
            className={cn(
              "cursor-pointer transition-all border-2",
              highlighted === role
                ? "border-primary"
                : "border-transparent hover:border-muted-foreground/30",
            )}
            onClick={() => setHighlighted(highlighted === role ? null : role)}
          >
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-xs font-semibold ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</p>
              <p className="text-2xl font-bold mt-1">{totalGrants(role)}</p>
              <p className="text-[10px] text-muted-foreground">CRUD grants</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CRUD matrix */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Admin CRUD Matrix</CardTitle>
          <CardDescription>
            Which Create / Read / Update / Delete operations each role can perform on each admin resource. Click a role card to highlight its column.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Resource</th>
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
                {ADMIN_RESOURCES.map((resource) => (
                  <tr key={resource} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium text-sm">{RESOURCE_LABELS[resource]}</td>
                    {ROLES.map((role) => {
                      const granted = ROLE_CRUD[role]?.[resource] ?? [];
                      return (
                        <td
                          key={role}
                          className={cn(
                            "px-3 py-2.5 text-center",
                            highlighted === role ? "bg-primary/10" : "",
                          )}
                        >
                          {granted.length > 0 ? (
                            <div className="flex gap-0.5 justify-center flex-wrap">
                              {(["create","read","update","delete"] as CrudAction[]).map((action) =>
                                granted.includes(action) ? (
                                  <CrudBadge key={action} action={action} />
                                ) : null
                              )}
                            </div>
                          ) : (
                            <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
