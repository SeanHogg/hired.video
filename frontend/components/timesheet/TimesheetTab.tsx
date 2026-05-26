import { Clock, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Workforce timesheet surface (employee + employer).
 *
 * Self-gates on role — returns null for viewers who aren't part of the
 * workforce loop (job_seeker / recruiter). Per the DRY rule, consumers
 * mount <TimesheetTab/> unconditionally and the component decides its
 * own visibility from the auth context.
 *
 * Phase 0 ships this gated placeholder; the punch-in/out timer + weekly
 * aggregation + employer approval queue land in Phase 1 of #1349.
 */
export function TimesheetTab() {
  const { user } = useAuth();
  const permissions = createRolePermissions(user?.role);
  const showsEmployeeView = permissions.canPunchTime;
  const showsEmployerView = permissions.canManageWorkforce;
  if (!showsEmployeeView && !showsEmployerView) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Timesheet</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Phase 1 coming soon
          </CardTitle>
          <CardDescription>
            {showsEmployeeView
              ? "Punch in / out against your assigned tasks here. The timer + weekly aggregation arrives in Phase 1."
              : "Workforce approval queue, policy, and aggregate timesheet views arrive in Phase 1 (back-office /settings → Workforce will also gain a queue surface)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Foundation is live in Phase 0: workforce role + invite plumbing.
            Tracked under the Bullhorn-lite back-office build.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
