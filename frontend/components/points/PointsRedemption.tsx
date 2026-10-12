// Cash-out catalog for the points hub: SKUs grouped by kind, the redeem
// flow (toast + celebration per fulfilment status) and the gift-card
// recipient dialog. Split out of PointsHub so each file stays focused.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Calendar, CreditCard, Gift, Loader2, Megaphone, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MonoChip from "@/components/templates/MonoChip";
import { pointsService, type PointsCatalog, type PointsRedemption } from "@/lib/services/points-service";
import { celebrate } from "@/lib/points/celebration";
import { cn } from "@/lib/utils";

type RedemptionKind = PointsCatalog["redemptions"][number]["kind"];

const GROUPS: ReadonlyArray<{ kind: RedemptionKind; labelKey: string; icon: typeof Sparkles }> = [
  { kind: "ai_credits", labelKey: "points.hub.group.aiCredits", icon: Sparkles },
  { kind: "premium_month", labelKey: "points.hub.group.proTime", icon: Calendar },
  { kind: "gift_card", labelKey: "points.hub.group.giftCards", icon: Gift },
  { kind: "campaign_dollars", labelKey: "points.hub.group.campaign", icon: Megaphone },
];

export function RedemptionGrid({
  catalog,
  balance,
  disabled,
}: {
  catalog: PointsCatalog | null;
  balance: number;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [giftCardSku, setGiftCardSku] = useState<PointsRedemption | null>(null);

  if (!catalog) return null;

  async function executeRedeem(skuId: string, recipient?: { name: string; email: string }) {
    setRedeeming(skuId);
    try {
      const res = await pointsService.redeem({
        skuId,
        recipientName: recipient?.name,
        recipientEmail: recipient?.email,
      });
      if (res.status === "fulfilled") {
        toast.success(t("points.hub.toast.fulfilled"));
        celebrate({
          kind: "reward",
          title: t("messages.rewards.rewardRedeemedTitle"),
          description: t("messages.rewards.rewardRedeemedBody"),
          iconKey: "gift",
          tier: "gold",
        });
      } else if (res.status === "queued") {
        toast.success(t("points.hub.toast.queued"), {
          description: t("points.hub.toast.queuedBody"),
        });
      } else if (res.status === "pending_kyc") {
        toast.message(t("points.hub.toast.kyc"), {
          description: t("points.hub.toast.kycBody"),
        });
      }
      qc.invalidateQueries({ queryKey: ["points"] });
      setGiftCardSku(null);
    } catch (e) {
      const err = e as { message?: string };
      toast.error(t("points.hub.toast.failed"), { description: err.message ?? String(e) });
    } finally {
      setRedeeming(null);
    }
  }

  function handleRedeemClick(sku: PointsRedemption) {
    if (sku.available === false) return; // coming soon — not redeemable yet
    if (sku.kind === "gift_card") {
      setGiftCardSku(sku);
    } else {
      void executeRedeem(sku.id);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold tracking-[-0.02em]">
        <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" /> {t("points.hub.cashOut")}
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">{t("messages.rewards.cashoutHubDesc")}</p>
      <div className="space-y-6">
        {GROUPS.map(({ kind, labelKey, icon: Icon }) => {
          const items = catalog.redemptions.filter((r) => r.kind === kind);
          if (items.length === 0) return null;
          return (
            <div key={kind}>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {t(labelKey)}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3">
                {items.map((sku) => {
                  const comingSoon = sku.available === false;
                  const affordable = balance >= sku.pointsCost;
                  return (
                    <div
                      key={sku.id}
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border border-border bg-background p-3",
                        (comingSoon || !affordable) && "opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                        {sku.label}
                        {comingSoon && <MonoChip>{t("labels.rewards.comingSoon")}</MonoChip>}
                      </div>
                      <div className="font-mono text-xs tabular-nums text-muted-foreground">
                        {t("points.hub.pts", { value: sku.pointsCost.toLocaleString() })}
                      </div>
                      <Button
                        size="sm"
                        variant={!comingSoon && affordable ? "default" : "outline"}
                        className="mt-2 min-h-11 w-full sm:min-h-9"
                        disabled={disabled || comingSoon || !affordable || redeeming === sku.id}
                        onClick={() => handleRedeemClick(sku)}
                      >
                        {comingSoon ? (
                          t("labels.rewards.comingSoon")
                        ) : redeeming === sku.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-label={t("status.loading")} />
                        ) : (
                          t("points.hub.redeem")
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <GiftCardDialog
        sku={giftCardSku}
        defaultEmail={user?.email ?? ""}
        defaultName={user?.name ?? ""}
        busy={!!redeeming}
        onCancel={() => setGiftCardSku(null)}
        onConfirm={(name, email) => giftCardSku && executeRedeem(giftCardSku.id, { name, email })}
      />
    </Card>
  );
}

function GiftCardDialog({
  sku,
  defaultName,
  defaultEmail,
  busy,
  onCancel,
  onConfirm,
}: {
  sku: PointsRedemption | null;
  defaultName: string;
  defaultEmail: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (name: string, email: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);

  return (
    <Dialog open={!!sku} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("points.hub.gift.title", { label: sku?.label ?? "" })}</DialogTitle>
          <DialogDescription>{t("points.hub.gift.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="gc-name">{t("points.hub.gift.name")}</Label>
            <Input id="gc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gc-email">{t("points.hub.gift.email")}</Label>
            <Input id="gc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{t("points.hub.gift.taxNote")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={() => onConfirm(name, email)} disabled={busy || !name.trim() || !email.includes("@")}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-label={t("status.loading")} /> : t("points.hub.gift.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
