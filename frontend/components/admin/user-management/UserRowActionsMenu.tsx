import { useTranslation } from "react-i18next";
import {
  MoreHorizontal,
  UserCheck,
  UserX,
  Eye,
  History,
  ShieldCheck,
  Loader2,
  Coins,
  RotateCcw,
  KeyRound,
  Sparkles,
  Undo2,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { ROLE_CHANGE_OPTIONS, isUserActive } from "./helpers";
import type { ApiUser, UserManagementPermissions, UserRowHandlers } from "./types";

interface UserRowActionsMenuProps {
  user: ApiUser;
  permissions: UserManagementPermissions;
  handlers: UserRowHandlers;
  isHealing: boolean;
}

export function UserRowActionsMenu({ user, permissions, handlers, isHealing }: UserRowActionsMenuProps) {
  const { t } = useTranslation();
  const { canUpdate, canDelete, canImpersonate, canManageTokens, isSuperAdmin } = permissions;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => handlers.onViewProfile(user)}>
          <Eye className="h-4 w-4 mr-2" />{t("actions.viewProfile")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handlers.onViewHistory(user)}>
          <History className="h-4 w-4 mr-2" />{t("actions.viewHistory")}
        </DropdownMenuItem>
        {canUpdate && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ShieldCheck className="h-4 w-4 mr-2" />{t("actions.changeRole")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {ROLE_CHANGE_OPTIONS
                .filter((r) => r !== user.role)
                .map((r) => (
                  <DropdownMenuItem key={r} onSelect={() => handlers.onChangeRole(user, r)}>
                    {t("actions.setRole", { role: getRoleDisplayLabel(r) })}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canImpersonate && (
          <DropdownMenuItem onSelect={() => handlers.onImpersonate(user)}>
            <UserCheck className="h-4 w-4 mr-2" />{t("actions.impersonate")}
          </DropdownMenuItem>
        )}
        {canUpdate && (
          <DropdownMenuItem onSelect={() => handlers.onSendPasswordReset(user)}>
            <KeyRound className="h-4 w-4 mr-2" />{t("actions.sendPasswordReset")}
          </DropdownMenuItem>
        )}
        {/* Editorial / house-author flag — SuperAdmin-only. */}
        {isSuperAdmin && (
          <DropdownMenuItem onSelect={() => handlers.onToggleSystem(user)}>
            <Sparkles className="h-4 w-4 mr-2" />
            {user.isSystem ? t("actions.unmarkEditorial") : t("actions.markEditorial")}
          </DropdownMenuItem>
        )}
        {canUpdate && user.resumeCount > 0 && (
          <DropdownMenuItem
            onSelect={() => handlers.onHealResumes(user)}
            disabled={isHealing}
          >
            {isHealing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Stethoscope className="h-4 w-4 mr-2" />
            )}
            {t("actions.healResumeData", { count: user.resumeCount })}
          </DropdownMenuItem>
        )}
        {canManageTokens && !user.isUnlimited && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handlers.onGrantTokens(user)}>
              <Coins className="h-4 w-4 mr-2" />{t("actions.grantTokens")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onResetTokens(user)}>
              <RotateCcw className="h-4 w-4 mr-2" />{t("actions.resetMonthlyUsage")}
            </DropdownMenuItem>
          </>
        )}
        {canUpdate && !user.isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handlers.onOpenOverride(user)}>
              <Sparkles className="h-4 w-4 mr-2" />
              {user.planOverride?.active ? t("actions.editPlanOverride") : t("actions.planOverride")}
            </DropdownMenuItem>
            {user.planOverride?.active && (
              <DropdownMenuItem onSelect={() => handlers.onClearOverride(user)}>
                <Undo2 className="h-4 w-4 mr-2" />
                {t("actions.resetToPlan", { plan: user.planOverride.originalPlanName })}
              </DropdownMenuItem>
            )}
          </>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            {isUserActive(user) ? (
              <DropdownMenuItem className="text-destructive" onSelect={() => handlers.onToggleStatus(user)}>
                <UserX className="h-4 w-4 mr-2" />
                {t("actions.suspend")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => handlers.onToggleStatus(user)}>
                <UserCheck className="h-4 w-4 mr-2" />
                {t("actions.reactivate")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
