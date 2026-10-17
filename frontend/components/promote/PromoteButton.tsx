/**
 * Generic "Promote" button + modal. Drops in next to any user-generated
 * subject the owner controls — reviews, feed posts, videos, résumés, voice
 * clones, etc. The modal collects budget + duration and starts the paid
 * boost checkout (POST /api/checkout {kind:"boost"}); the server enforces
 * ownership.
 *
 * Paying: Campaign $ are drawn first. Any USD left owing opens the app's
 * payment widget right away (useBoostPayment — same flow as token packs),
 * and the server verifies the charge with the provider before the boost
 * goes live. Closing the widget keeps the boost pending; "Finish payment"
 * reopens it (also offered on a later visit for this subject's unpaid boost).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { boostService, type Boost } from "@/lib/services/boost-service";
import { useBoostPayment, type BoostPaymentState } from "@/hooks/use-boost-payment";
import type { BoostableSubject } from "@shared/checkout";

interface PromoteButtonProps {
  subjectType: BoostableSubject;
  subjectId: string;
  /** Display label for the modal copy ("Promote your review of Acme"). */
  subjectLabel: string;
  /** Optional render override for the trigger element. */
  trigger?: React.ReactNode;
  onPromoted?: (boost: Boost) => void;
}

const PLACEMENTS = ["feed_top", "discovery", "all"] as const;

export function PromoteButton({
  subjectType,
  subjectId,
  subjectLabel,
  trigger,
  onPromoted,
}: PromoteButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [budgetDollars, setBudgetDollars] = useState("10");
  const [durationDays, setDurationDays] = useState("7");
  const [placement, setPlacement] = useState<string>("feed_top");
  const [submitting, setSubmitting] = useState(false);
  /** A boost for this subject still waiting on its USD payment. */
  const [unpaid, setUnpaid] = useState<Boost | null>(null);
  const { state: payment, pay, reset } = useBoostPayment();

  // On open, surface an earlier unpaid boost for this subject.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    boostService
      .listMine()
      .then((items) => {
        if (cancelled) return;
        const pending = items.find(
          (b) => b.subjectType === subjectType && b.subjectId === subjectId && b.status === "pending_payment",
        );
        setUnpaid(pending ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, subjectType, subjectId]);

  const finish = (boost: Boost, outcome: BoostPaymentState) => {
    if (outcome.status === "paid") {
      toast({ title: t("boostCheckout.live.title"), description: t("boostCheckout.paid.description") });
      onPromoted?.({ ...boost, status: "active" });
      setUnpaid(null);
      setOpen(false);
      reset();
    } else if (outcome.status === "verifying") {
      toast({ title: t("boostCheckout.verifying.title"), description: t("boostCheckout.verifying.description") });
    }
    // cancelled / error: stay open with "Finish payment".
  };

  const payFor = async (boost: Boost) => {
    setUnpaid(boost);
    finish(boost, await pay(boost.id));
  };

  const handleSubmit = async () => {
    const dollars = parseFloat(budgetDollars);
    const days = parseInt(durationDays, 10);
    if (!Number.isFinite(dollars) || dollars < 1) {
      toast({ title: t("boostCheckout.validation.budget"), variant: "destructive" });
      return;
    }
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      toast({ title: t("boostCheckout.validation.duration"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const boost = await boostService.create({
        subjectType,
        subjectId,
        budgetCents: Math.round(dollars * 100),
        durationDays: days,
        placementType: placement,
        pricingModel: "flat",
      });
      if (boost.status === "active") {
        // Campaign $ covered it in full.
        toast({ title: t("boostCheckout.live.title"), description: t("boostCheckout.live.description", { count: days }) });
        onPromoted?.(boost);
        setOpen(false);
        return;
      }
      await payFor(boost);
    } catch (err: unknown) {
      toast({
        title: t("boostCheckout.error.title"),
        description: err instanceof Error && err.message ? err.message : t("boostCheckout.error.description"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || payment.status === "processing";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Megaphone className="h-4 w-4" aria-hidden />
            {t("boostCheckout.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("boostCheckout.title", { subject: subjectLabel })}</DialogTitle>
          <DialogDescription>{t("boostCheckout.description")}</DialogDescription>
        </DialogHeader>

        {unpaid ? (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm" role="status">
            <p className="font-medium text-foreground">{t("boostCheckout.unpaid.title")}</p>
            <p className="text-muted-foreground">
              {payment.status === "cancelled"
                ? t("boostCheckout.unpaid.cancelled")
                : payment.status === "error"
                  ? t("boostCheckout.unpaid.error")
                  : payment.status === "verifying"
                    ? t("boostCheckout.verifying.description")
                    : t("boostCheckout.unpaid.description")}
            </p>
            <Button className="w-full sm:w-auto" onClick={() => void payFor(unpaid)} disabled={busy}>
              {payment.status === "processing" ? t("boostCheckout.paying") : t("boostCheckout.finishPayment")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="boost-budget" className="mb-2 block">{t("boostCheckout.budget")}</Label>
              <Input
                id="boost-budget"
                type="number"
                min="1"
                step="1"
                value={budgetDollars}
                onChange={(e) => setBudgetDollars(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="boost-duration" className="mb-2 block">{t("boostCheckout.duration")}</Label>
              <Input
                id="boost-duration"
                type="number"
                min="1"
                max="90"
                step="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="boost-placement" className="mb-2 block">{t("boostCheckout.placement")}</Label>
              <Select value={placement} onValueChange={setPlacement}>
                <SelectTrigger id="boost-placement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => (
                    <SelectItem key={p} value={p}>{t(`boostCheckout.placements.${p}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              {t("boostCheckout.paymentNote")}
            </p>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("boostCheckout.close")}
          </Button>
          {!unpaid && (
            <Button onClick={handleSubmit} disabled={busy}>
              {busy ? t("boostCheckout.starting") : t("boostCheckout.start")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
