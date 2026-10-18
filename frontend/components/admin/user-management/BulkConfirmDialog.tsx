import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BulkAction, BulkConfirmAction } from "./types";

interface BulkConfirmDialogProps {
  action: BulkConfirmAction | null;
  selectedCount: number;
  pendingBulk: BulkAction | null;
  onClose: () => void;
  onConfirm: (action: BulkConfirmAction) => void;
}

/** Bulk ban / delete confirmation. */
export function BulkConfirmDialog({ action, selectedCount, pendingBulk, onClose, onConfirm }: BulkConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === "delete" ? t("messages.confirmDeleteUsersTitle") : t("messages.confirmBanUsersTitle")}
          </DialogTitle>
          <DialogDescription>
            {action === "delete"
              ? t("messages.confirmDeleteUsersBody", { count: selectedCount })
              : t("messages.confirmBanUsersBody", { count: selectedCount })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pendingBulk !== null}
          >
            {t("actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => action && onConfirm(action)}
            disabled={pendingBulk !== null}
          >
            {pendingBulk !== null && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {action === "delete" ? t("actions.deletePermanently") : t("actions.banUsers")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
