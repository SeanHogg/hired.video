// AssignActivityButton — self-gating entry point for assigning a paid activity.
//
// Per the DRY rule, consumers (pipeline Hired card, placement detail, Team
// page) mount this unconditionally and it decides its own visibility: only
// users who can manage jobs / workforce see it. It owns the dialog state so
// every call site gets the same behaviour for free.

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import AssignActivityDialog from "./AssignActivityDialog";
import type { ActivityDTO } from "@/lib/services/activities-service";

interface AssignActivityButtonProps {
  worker?: { userId: string; name?: string; companyId?: string } | null;
  onAssigned?: (activity: ActivityDTO) => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Override the button label; defaults to "Assign activity". */
  label?: string;
}

export default function AssignActivityButton({
  worker,
  onAssigned,
  variant = "outline",
  size = "sm",
  className,
  label,
}: AssignActivityButtonProps): JSX.Element | null {
  const { t } = useTranslation();
  const { user } = useAuth();
  const permissions = createRolePermissions(user?.role);
  const [open, setOpen] = useState(false);

  // Employer-facing action only.
  if (!permissions.canManageWorkforce && !permissions.canPostJobs && !permissions.canManageJobs) {
    return null;
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <ClipboardList className="mr-2 h-4 w-4" />
        {label ?? t("activities.assign.button")}
      </Button>
      <AssignActivityDialog open={open} onOpenChange={setOpen} worker={worker} onAssigned={onAssigned} />
    </>
  );
}
