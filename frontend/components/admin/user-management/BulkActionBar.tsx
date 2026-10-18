import { useTranslation } from "react-i18next";
import { Loader2, UserX, Ban, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BulkAction, BulkConfirmAction } from "./types";

interface BulkActionBarProps {
  selectedCount: number;
  pendingBulk: BulkAction | null;
  onSuspend: () => void;
  onConfirm: (action: BulkConfirmAction) => void;
  onClear: () => void;
}

/** Bulk action bar — appears when ≥1 user is selected. */
export function BulkActionBar({ selectedCount, pendingBulk, onSuspend, onConfirm, onClear }: BulkActionBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-md border border-brand-primary/30 bg-brand-primary/5 px-4 py-2">
      <span className="text-sm font-medium">
        {t("labels.selectedUsersCount", { count: selectedCount })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pendingBulk !== null}
          onClick={onSuspend}
        >
          {pendingBulk === "suspend" ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <UserX className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t("actions.suspend")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pendingBulk !== null}
          onClick={() => onConfirm("ban")}
        >
          <Ban className="h-3.5 w-3.5 mr-1.5" />
          {t("actions.ban")}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={pendingBulk !== null}
          onClick={() => onConfirm("delete")}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          {t("actions.deleteAdmin")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pendingBulk !== null}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5 mr-1.5" />
          {t("actions.clear")}
        </Button>
      </div>
    </div>
  );
}
