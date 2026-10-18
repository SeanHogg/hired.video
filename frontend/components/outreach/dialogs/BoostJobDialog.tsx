import { Loader2, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { JobSummary } from "@/lib/services/job-service";
import type {
  BoostPlacementType,
  BoostPricingModel,
  JobBoostState,
} from "@/components/outreach/hooks/useJobBoost";
import { UserJobSelect } from "@/components/outreach/dialogs/UserJobSelect";

/** Boost Job Dialog — configure a sponsored placement, then pay. */
export function BoostJobDialog({
  state,
  userJobs,
}: {
  state: JobBoostState;
  userJobs: JobSummary[];
}) {
  const { t } = useTranslation();
  const { boostBudget, boostDuration, boostSubmitting } = state;
  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-primary" />
            {t("actions.boostJobListing")}
          </DialogTitle>
          <DialogDescription>
            {t("messages.boostDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("fields.jobToBoost.label")}</Label>
            <UserJobSelect
              value={state.boostJobId}
              onValueChange={state.setBoostJobId}
              placeholder={t("fields.jobToBoost.placeholder")}
              userJobs={userJobs}
              emptyValue="none"
              emptyLabel={t("labels.noJobPostingsFound")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("fields.placement.label")}</Label>
            <Select value={state.boostPlacementType} onValueChange={(v) => state.setBoostPlacementType(v as BoostPlacementType)}>
              <SelectTrigger>
                <SelectValue placeholder={t("fields.placement.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="search_top">{t("labels.searchTopDescription")}</SelectItem>
                <SelectItem value="discovery_feed">{t("labels.discoveryFeedDescription")}</SelectItem>
                <SelectItem value="both">{t("labels.bothPlacementsDescription")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("fields.pricingModel.label")}</Label>
            <Select value={state.boostPricingModel} onValueChange={(v) => state.setBoostPricingModel(v as BoostPricingModel)}>
              <SelectTrigger>
                <SelectValue placeholder={t("fields.pricingModel.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpm">{t("labels.cpmDescription")}</SelectItem>
                <SelectItem value="cpc">{t("labels.cpcDescription")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.totalBudget.label")}</Label>
              <Input
                type="number"
                min="10"
                step="5"
                placeholder={t("fields.totalBudget.placeholder")}
                value={boostBudget}
                onChange={(e) => state.setBoostBudget(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("labels.minimumTen")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("fields.duration.label")}</Label>
              <Select value={boostDuration} onValueChange={state.setBoostDuration}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.duration.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t("labels.daysSeven")}</SelectItem>
                  <SelectItem value="14">{t("labels.daysFourteen")}</SelectItem>
                  <SelectItem value="30">{t("labels.daysThirty")}</SelectItem>
                  <SelectItem value="60">{t("labels.daysSixty")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {boostBudget && boostDuration && parseFloat(boostBudget) >= 10 && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("labels.dailyBudget")}</span>
                <span className="font-medium">
                  {t("labels.dailyBudgetValue", { amount: (parseFloat(boostBudget) / parseInt(boostDuration)).toFixed(2) })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("labels.totalCharge")}</span>
                <span className="font-bold">${parseFloat(boostBudget).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={state.cancel}>
            {t("actions.cancel")}
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90"
            disabled={!state.canSubmit}
            onClick={state.submit}
          >
            {boostSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
            {t("actions.launchBoost")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
