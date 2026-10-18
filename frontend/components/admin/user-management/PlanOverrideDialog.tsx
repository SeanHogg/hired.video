import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OverridablePlanSlug } from "@/lib/services/superadmin-plan-override-service";
import { minOverrideExpiryDate } from "./helpers";
import type { ApiUser, OverrideTokenMode } from "./types";

interface PlanOverrideDialogProps {
  target: ApiUser | null;
  plan: OverridablePlanSlug | "keep";
  onPlanChange: (plan: OverridablePlanSlug | "keep") => void;
  tokenMode: OverrideTokenMode;
  onTokenModeChange: (mode: OverrideTokenMode) => void;
  tokenCustom: string;
  onTokenCustomChange: (value: string) => void;
  expires: string;
  onExpiresChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

/** Plan Override dialog — SuperAdmin comp / trial / custom token limit. */
export function PlanOverrideDialog({
  target,
  plan,
  onPlanChange,
  tokenMode,
  onTokenModeChange,
  tokenCustom,
  onTokenCustomChange,
  expires,
  onExpiresChange,
  reason,
  onReasonChange,
  saving,
  onClose,
  onSubmit,
}: PlanOverrideDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("prompts.dialogPlanOverride")}</DialogTitle>
          <DialogDescription>
            {target && (
              <>{t("messages.overrideDialogIntro", { name: target.name, plan: target.planOverride?.originalPlanName ?? t("tiers.free.name") })}</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("labels.plan")}</Label>
            <Select value={plan} onValueChange={(v) => onPlanChange(v as OverridablePlanSlug | "keep")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t("prompts.planSelectKeep")}</SelectItem>
                <SelectItem value="free">{t("tiers.free.name")}</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="unlimited">{t("marketing.pricing.value.unlimited")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("prompts.monthlyTokenLimit")}</Label>
            <Select value={tokenMode} onValueChange={(v) => onTokenModeChange(v as OverrideTokenMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("prompts.tokenModeDefault")}</SelectItem>
                <SelectItem value="custom">{t("prompts.tokenModeCustom")}</SelectItem>
                <SelectItem value="unlimited">{t("marketing.pricing.value.unlimited")}</SelectItem>
              </SelectContent>
            </Select>
            {tokenMode === "custom" && (
              <Input
                type="number"
                min={1}
                step={1}
                placeholder={t("prompts.tokenCustomPlaceholder")}
                value={tokenCustom}
                onChange={(e) => onTokenCustomChange(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-expires">{t("prompts.expiresOnOptional")}</Label>
            <Input
              id="override-expires"
              type="date"
              value={expires}
              onChange={(e) => onExpiresChange(e.target.value)}
              min={minOverrideExpiryDate()}
            />
            <p className="text-xs text-muted-foreground">
              {t("messages.overrideExpiresHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-reason">{t("prompts.reasonRequired")}</Label>
            <Input
              id="override-reason"
              placeholder={t("prompts.overrideReasonPlaceholder")}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={saving || !reason.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {target?.planOverride?.active ? t("actions.saveChanges") : t("actions.applyOverride")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
