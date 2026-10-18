import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api-client";
import type { IdSelection } from "@/hooks/use-id-selection";
import type { BulkAction, BulkConfirmAction } from "./types";

type BulkSelection = Pick<IdSelection, "ids" | "clear">;

/** Bulk ban / suspend / delete over the current row selection. */
export function useBulkUserActions(selection: BulkSelection, refresh: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pendingBulk, setPendingBulk] = useState<null | BulkAction>(null);
  const [bulkConfirm, setBulkConfirm] = useState<null | BulkConfirmAction>(null);

  const runBulkAction = async (action: BulkAction) => {
    const ids = selection.ids;
    if (ids.length === 0) return;
    try {
      setPendingBulk(action);
      const res = await apiClient.post<{
        succeeded: string[];
        skipped: Array<{ userId: string; reason: "not_found" | "self" | "super_admin" }>;
      }>(`/api/admin/sa/users/bulk/${action}`, { userIds: ids });
      const { succeeded, skipped } = res.data;
      const verb = action === "delete" ? t("admin.bulkVerbs.deleted") : action === "ban" ? t("admin.bulkVerbs.banned") : t("admin.bulkVerbs.suspended");
      toast({
        title: t("messages.bulkSuccess", { count: succeeded.length, verb }),
        description: skipped.length > 0
          ? t("messages.bulkSkippedSuffix", { count: skipped.length })
          : undefined,
      });
      selection.clear();
      setBulkConfirm(null);
      refresh();
    } catch (err) {
      toast({
        title: t("errors.failedBulkAction", { action: action === "delete" ? t("admin.actions.bulkDelete") : action === "ban" ? t("admin.actions.bulkBan") : t("admin.actions.bulkSuspend") }),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPendingBulk(null);
    }
  };

  return { pendingBulk, bulkConfirm, setBulkConfirm, runBulkAction };
}
