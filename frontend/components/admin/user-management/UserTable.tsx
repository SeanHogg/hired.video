import { useTranslation } from "react-i18next";
import { Loader2, Wrench, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { IdSelection } from "@/hooks/use-id-selection";
import { STATUS_COLORS, STATUS_LABEL_KEYS, formatTokens, getUserStatus, isBulkSelectable } from "./helpers";
import { UserIdentityCell, UserRoleCell, UserPlanCell, UserTokensCell } from "./UserTableCells";
import { UserRowActionsMenu } from "./UserRowActionsMenu";
import type { ApiUser, FormatDate, UserManagementPermissions, UserRowHandlers } from "./types";

interface UserTableProps {
  users: ApiUser[];
  loading: boolean;
  currentUserId: string | undefined;
  selection: IdSelection;
  selectableIds: string[];
  permissions: UserManagementPermissions;
  handlers: UserRowHandlers;
  healingUserId: string | null;
  formatDate: FormatDate;
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

/**
 * Table — wrapperClassName="overflow-visible" disables the shared Table's
 * overflow-auto wrapper so position:sticky on <thead> applies against the
 * page scroll (otherwise the wrapper becomes the sticky containing block and
 * the header stays put when only the wrapper scrolls — i.e. never on
 * desktop). The horizontal scroll for narrow viewports is accepted as a
 * tradeoff; admin users on mobile are rare and can scroll the page itself.
 */
export function UserTable({
  users,
  loading,
  currentUserId,
  selection,
  selectableIds,
  permissions,
  handlers,
  healingUserId,
  formatDate,
}: UserTableProps) {
  const { t } = useTranslation();
  const { canDelete } = permissions;
  return (
    <Card>
      <Table wrapperClassName="overflow-visible">
        {/* top-32 = 8rem = 128px = 64 (fixed Navigation) + 64
            (sticky filter container above). z-20 sits below the
            filters' z-30 so the dropdown menus open above the
            table header cleanly. bg-background prevents row
            content bleeding through under the sticky row. The
            shadow-sm on the bottom edge gives the header a clear
            visual anchor when it's pinned. */}
        <TableHeader className="sticky top-32 z-20 bg-background shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
          <TableRow>
            <TableHead className="w-10">
              {canDelete && (
                <Checkbox
                  aria-label={t("admin.userManagement.selectAllUsers")}
                  checked={selection.headerState(selectableIds)}
                  onCheckedChange={(v) => selection.setMany(selectableIds, v === true)}
                  disabled={selectableIds.length === 0}
                />
              )}
            </TableHead>
            <TableHead>{t("labels.userFallback")}</TableHead>
            <TableHead>{t("labels.role")}</TableHead>
            <TableHead>{t("labels.plan")}</TableHead>
            <TableHead>{t("labels.tokens")}</TableHead>
            <TableHead>{t("labels.toolsUsed")}</TableHead>
            <TableHead>{t("labels.resumes")}</TableHead>
            <TableHead>{t("labels.callStatus")}</TableHead>
            <TableHead>{t("labels.joined")}</TableHead>
            <TableHead>{t("labels.lastLogin")}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-8">
                <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                {t("status.loadingUsers")}
              </TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                {t("messages.noUsersMatch")}
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => {
              const status = getUserStatus(user);
              const isSelectable = isBulkSelectable(user, currentUserId);
              return (
                <TableRow key={user.id} data-state={selection.isSelected(user.id) ? "selected" : undefined}>
                  <TableCell className="w-10">
                    {canDelete && isSelectable && (
                      <Checkbox
                        aria-label={t("admin.userManagement.selectUser", { name: user.name })}
                        checked={selection.isSelected(user.id)}
                        onCheckedChange={(v) => selection.toggle(user.id, v === true)}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <UserIdentityCell user={user} />
                  </TableCell>
                  <TableCell>
                    <UserRoleCell user={user} />
                  </TableCell>
                  <TableCell>
                    <UserPlanCell user={user} formatDate={formatDate} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <UserTokensCell user={user} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {user.toolRunCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => handlers.onViewToolHistory(user)}
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline font-medium"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        {user.toolRunCount}
                        {user.toolTokensUsed > 0 && (
                          <span className="text-xs text-muted-foreground font-normal">
                            {t("admin.userManagement.toolTokensSuffix", { amount: formatTokens(user.toolTokensUsed) })}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {user.resumeCount > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {user.resumeCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status]}`}>
                      {t(STATUS_LABEL_KEYS[status])}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(user.createdAt, DATE_OPTS)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt, DATE_OPTS) : "—"}
                  </TableCell>
                  <TableCell>
                    <UserRowActionsMenu
                      user={user}
                      permissions={permissions}
                      handlers={handlers}
                      isHealing={healingUserId === user.id}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
