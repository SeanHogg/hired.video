/**
 * #2396 — Ad-set create/edit dialog. Fields match CreateAdSetSchema
 * (api/src/routes/advertising/schemas.ts). Targeting is the canonical
 * AdSetTargeting shape via AdTargetingPanel (#1770).
 */

import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { advertisingService, type AdSet } from "@/lib/services/advertising-service";
import { parseAdSetTargeting, type AdSetTargeting } from "@shared/ad-targeting";
import AdTargetingPanel from "./AdTargetingPanel";

const PLACEMENTS = ["search_top", "discovery_feed", "both", "email", "push"] as const;
const PRICING = ["cpm", "cpc", "auto"] as const;
const BID_STRATEGIES = ["manual", "maximize_clicks", "maximize_impressions", "target_cpa"] as const;

export interface AdSetEditorProps {
  campaignId: string;
  adSet?: AdSet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoDatetime(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function dollarsToCents(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export default function AdSetEditor({
  campaignId,
  adSet,
  open,
  onOpenChange,
  onSaved,
}: AdSetEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [placementType, setPlacementType] = useState<string>("search_top");
  const [pricingModel, setPricingModel] = useState<string>("cpc");
  const [bidStrategy, setBidStrategy] = useState<string>("manual");
  const [bidDollars, setBidDollars] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("");
  const [frequencyCapCount, setFrequencyCapCount] = useState(5);
  const [frequencyCapHours, setFrequencyCapHours] = useState(24);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [targeting, setTargeting] = useState<AdSetTargeting>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(adSet?.name ?? "");
    setPlacementType(adSet?.placementType ?? "search_top");
    setPricingModel(adSet?.pricingModel ?? "cpc");
    setBidStrategy(adSet?.bidStrategy ?? "manual");
    setBidDollars(centsToDollars(adSet?.bidAmountCents));
    setBudgetDollars(centsToDollars(adSet?.budgetCents));
    setFrequencyCapCount(adSet?.frequencyCapCount ?? 5);
    setFrequencyCapHours(adSet?.frequencyCapHours ?? 24);
    setStartAt(toDatetimeLocal(adSet?.startAt));
    setEndAt(toDatetimeLocal(adSet?.endAt));
    setTargeting(parseAdSetTargeting(adSet?.targetingJson));
    setSaving(false);
  }, [open, adSet]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const payload: Partial<AdSet> = {
      name: trimmed,
      placementType,
      pricingModel,
      bidStrategy,
      targetingJson: targeting as Record<string, unknown>,
      frequencyCapCount,
      frequencyCapHours,
    };
    const bid = dollarsToCents(bidDollars);
    if (bid != null && bid >= 1) payload.bidAmountCents = bid;
    const budget = dollarsToCents(budgetDollars);
    if (budget != null) payload.budgetCents = budget;
    const start = toIsoDatetime(startAt);
    if (start) payload.startAt = start;
    const end = toIsoDatetime(endAt);
    if (end) payload.endAt = end;

    setSaving(true);
    try {
      if (adSet) {
        await advertisingService.updateAdSet(adSet.id, payload);
        toast({ title: t("messages.paidMedia.adSetUpdated") });
      } else {
        await advertisingService.createAdSet(campaignId, payload);
        toast({ title: t("messages.paidMedia.adSetCreated") });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : t("messages.paidMedia.unknownError"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {adSet ? t("labels.paidMedia.editAdSet") : t("labels.paidMedia.newAdSet")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="ad-set-name">{t("labels.name")}</Label>
            <Input
              id="ad-set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("labels.paidMedia.adSetNamePlaceholder")}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-placement">{t("labels.paidMedia.colPlacement")}</Label>
              <select
                id="ad-set-placement"
                className="w-full text-sm border rounded px-2 py-1.5 bg-background"
                value={placementType}
                onChange={(e) => setPlacementType(e.target.value)}
              >
                {PLACEMENTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-pricing">{t("labels.paidMedia.colPricing")}</Label>
              <select
                id="ad-set-pricing"
                className="w-full text-sm border rounded px-2 py-1.5 bg-background"
                value={pricingModel}
                onChange={(e) => setPricingModel(e.target.value)}
              >
                {PRICING.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-bid-strategy">{t("labels.paidMedia.colBidStrategy")}</Label>
              <select
                id="ad-set-bid-strategy"
                className="w-full text-sm border rounded px-2 py-1.5 bg-background"
                value={bidStrategy}
                onChange={(e) => setBidStrategy(e.target.value)}
              >
                {BID_STRATEGIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-bid">{t("labels.paidMedia.bidAmount")} ($)</Label>
              <Input
                id="ad-set-bid"
                type="number"
                min={0}
                step="0.01"
                value={bidDollars}
                onChange={(e) => setBidDollars(e.target.value)}
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-budget">{t("labels.paidMedia.budget")} ($)</Label>
              <Input
                id="ad-set-budget"
                type="number"
                min={0}
                step="0.01"
                value={budgetDollars}
                onChange={(e) => setBudgetDollars(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="ad-set-freq-count">{t("labels.paidMedia.frequencyCap")}</Label>
              <Input
                id="ad-set-freq-count"
                type="number"
                min={1}
                max={100}
                value={frequencyCapCount}
                onChange={(e) => setFrequencyCapCount(Number(e.target.value) || 1)}
                className="w-24"
              />
            </div>
            <span className="text-sm text-muted-foreground pb-2">{t("labels.paidMedia.impressionsPer")}</span>
            <div className="space-y-1">
              <Label htmlFor="ad-set-freq-hours" className="sr-only">{t("labels.paidMedia.hours")}</Label>
              <Input
                id="ad-set-freq-hours"
                type="number"
                min={1}
                max={168}
                value={frequencyCapHours}
                onChange={(e) => setFrequencyCapHours(Number(e.target.value) || 1)}
                className="w-24"
              />
            </div>
            <span className="text-sm text-muted-foreground pb-2">{t("labels.paidMedia.hours")}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-start">{t("labels.paidMedia.startDate")}</Label>
              <Input
                id="ad-set-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="ad-set-end">{t("labels.paidMedia.endDate")}</Label>
              <Input
                id="ad-set-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <section className="space-y-2" aria-labelledby="ad-set-targeting">
            <h3 id="ad-set-targeting" className="text-sm font-medium">
              {t("labels.paidMedia.colTargeting")}
            </h3>
            <AdTargetingPanel value={targeting} onChange={setTargeting} />
          </section>

          <DialogFooter>
            <button
              type="button"
              className="text-sm border rounded px-3 py-1.5 hover:bg-muted"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("actions.paidMedia.cancel")}
            </button>
            <button
              type="submit"
              className="text-sm bg-primary text-primary-foreground rounded px-3 py-1.5 disabled:opacity-50"
              disabled={saving || !name.trim()}
            >
              {t("actions.paidMedia.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
