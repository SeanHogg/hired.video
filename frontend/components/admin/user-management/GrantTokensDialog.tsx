import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApiUser } from "./types";

interface GrantTokensDialogProps {
  target: ApiUser | null;
  tokens: string;
  onTokensChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  granting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export function GrantTokensDialog({
  target,
  tokens,
  onTokensChange,
  reason,
  onReasonChange,
  granting,
  onClose,
  onSubmit,
}: GrantTokensDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("prompts.dialogGrantTokens")}</DialogTitle>
          <DialogDescription>
            {t("messages.grantTokensDesc", { name: target?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="grant-tokens">{t("labels.tokens")}</Label>
            <Input
              id="grant-tokens"
              type="number"
              min={1}
              step={1}
              placeholder={t("prompts.tokenAmountPlaceholder")}
              value={tokens}
              onChange={(e) => onTokensChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("messages.grantTokensHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grant-reason">{t("prompts.reasonOptional")}</Label>
            <Input
              id="grant-reason"
              placeholder={t("prompts.grantReasonPlaceholder")}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={granting}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={granting || !tokens}>
            {granting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("actions.grant")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
