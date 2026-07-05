// AssignActivityDialog — the employer's "assign a paid activity to a hired
// person" action. Shared by the Team page, the pipeline Hired column, and the
// placement detail page so the flow has ONE implementation (DRY).
//
// A worker can be pre-selected (opened from a candidate card) or picked from
// the assignable-workers list (hired candidates + existing employees). The
// activity is hourly (worker tracks time) or fixed (paid on completion); on
// approval the worker is credited through the existing payout rails.

import { useEffect, useMemo, useState } from "react";
import { Clock, DollarSign, Loader2, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  activitiesService,
  type ActivityDTO,
  type AssignableWorkerDTO,
} from "@/lib/services/activities-service";
import type { ActivityPayType } from "@shared/activities";

export interface AssignActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected worker (opened from a candidate/placement card). When set,
   *  the picker is hidden and this person is used. */
  worker?: { userId: string; name?: string; companyId?: string } | null;
  onAssigned?: (activity: ActivityDTO) => void;
}

export default function AssignActivityDialog({
  open,
  onOpenChange,
  worker,
  onAssigned,
}: AssignActivityDialogProps): JSX.Element {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [workers, setWorkers] = useState<AssignableWorkerDTO[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(worker?.userId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [payType, setPayType] = useState<ActivityPayType>("hourly");
  const [amount, setAmount] = useState(""); // dollars
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the assignable-workers list only when we need the picker.
  useEffect(() => {
    if (!open || worker) return;
    let cancelled = false;
    setWorkersLoading(true);
    activitiesService
      .listAssignableWorkers()
      .then((r) => {
        if (!cancelled) setWorkers(r.workers);
      })
      .catch(() => {
        /* surfaced on submit */
      })
      .finally(() => {
        if (!cancelled) setWorkersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, worker]);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelectedWorkerId(worker?.userId ?? "");
      setTitle("");
      setDescription("");
      setPayType("hourly");
      setAmount("");
      setDueDate("");
    }
  }, [open, worker]);

  const effectiveCompanyId = useMemo(() => {
    if (worker?.companyId) return worker.companyId;
    const w = workers.find((x) => x.userId === selectedWorkerId);
    return w?.companyId;
  }, [worker, workers, selectedWorkerId]);

  const amountCents = Math.round((parseFloat(amount) || 0) * 100);
  const canSubmit =
    !!selectedWorkerId && title.trim().length > 0 && amountCents > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const dto = await activitiesService.assign({
        workerUserId: selectedWorkerId,
        companyId: effectiveCompanyId,
        title: title.trim(),
        description: description.trim() || undefined,
        payType,
        rateCents: payType === "hourly" ? amountCents : undefined,
        amountCents: payType === "fixed" ? amountCents : undefined,
        currency: "USD",
        dueDate: dueDate || null,
      });
      toast({
        title: t("activities.assign.successTitle"),
        description: t("activities.assign.successBody", { title: dto.title }),
      });
      onAssigned?.(dto);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("activities.assign.errorTitle"),
        description: String((e as Error).message),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("activities.assign.title")}</DialogTitle>
          <DialogDescription>{t("activities.assign.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Worker picker (hidden when pre-selected) */}
          {worker ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("activities.assign.workerLabel")}: </span>
              <span className="font-medium">{worker.name ?? t("activities.assign.selectedWorker")}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="activity-worker">{t("activities.assign.workerLabel")}</Label>
              <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                <SelectTrigger id="activity-worker">
                  <SelectValue
                    placeholder={
                      workersLoading
                        ? t("status.loading")
                        : t("activities.assign.workerPlaceholder")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.userId} value={w.userId}>
                      {w.name}
                      {w.source === "hired" ? ` · ${t("activities.assign.sourceHired")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!workersLoading && workers.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("activities.assign.noWorkers")}</p>
              )}
            </div>
          )}

          {/* Title = the message / what to do */}
          <div className="space-y-1.5">
            <Label htmlFor="activity-title">{t("activities.assign.activityLabel")}</Label>
            <Input
              id="activity-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("activities.assign.activityPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-desc">{t("activities.assign.detailsLabel")}</Label>
            <Textarea
              id="activity-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("activities.assign.detailsPlaceholder")}
              className="min-h-[64px]"
            />
          </div>

          {/* Pay model */}
          <div className="space-y-1.5">
            <Label>{t("activities.assign.payModelLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayType("hourly")}
                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  payType === "hourly"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
                aria-pressed={payType === "hourly"}
              >
                <Clock className="h-4 w-4" />
                {t("activities.payType.hourly")}
              </button>
              <button
                type="button"
                onClick={() => setPayType("fixed")}
                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  payType === "fixed"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
                aria-pressed={payType === "fixed"}
              >
                <DollarSign className="h-4 w-4" />
                {t("activities.payType.fixed")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="activity-amount">
                {payType === "hourly"
                  ? t("activities.assign.rateLabel")
                  : t("activities.assign.amountLabel")}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="activity-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-6"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity-due">{t("activities.assign.dueLabel")}</Label>
              <Input
                id="activity-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {t("activities.assign.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
