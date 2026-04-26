// PricingConfigCard — SuperAdmin form to edit the runtime platform pricing
// (Pro monthly / yearly, per-seat). Single-row backend at platform_pricing;
// edits surface immediately on /pricing and through billing.ts (60s cache).
//
// Keeps the dollar↔cents conversion in one place so the API stays in cents
// (the canonical money unit) but the form shows dollars to the operator.

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  pricingConfigService,
  type PricingConfig,
} from "@/lib/services/pricing-config-service";

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(dollars: string): number {
  const n = Number.parseFloat(dollars);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function PricingConfigCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PricingConfig | null>(null);

  const [proMonthly, setProMonthly] = useState("9.95");
  const [proYearly, setProYearly] = useState("95.52");
  const [seatPrice, setSeatPrice] = useState("9.95");

  useEffect(() => {
    let cancelled = false;
    pricingConfigService
      .get()
      .then((cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        setProMonthly(centsToDollars(cfg.proMonthlyCents));
        setProYearly(centsToDollars(cfg.proYearlyCents));
        setSeatPrice(centsToDollars(cfg.seatPriceCents));
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: "Failed to load pricing config",
            description: "Falling back to hardcoded defaults. You can still save to seed the row.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await pricingConfigService.update({
        proMonthlyCents: dollarsToCents(proMonthly),
        proYearlyCents: dollarsToCents(proYearly),
        seatPriceCents: dollarsToCents(seatPrice),
      });
      setConfig(updated);
      toast({
        title: "Pricing updated",
        description: "/pricing and billing.ts will pick this up within 60 seconds (cache TTL).",
      });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Platform pricing</h2>
          <p className="text-xs text-muted-foreground">
            Edits flow to the public /pricing page and the per-seat company billing endpoint.
            All values are in USD. {config?.updatedAt && (
              <span className="ml-1">Last updated {new Date(config.updatedAt).toLocaleString()}.</span>
            )}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading current config…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pricing-pro-monthly">Pro / month ($)</Label>
                <Input
                  id="pricing-pro-monthly"
                  type="number"
                  step="0.01"
                  min="0"
                  value={proMonthly}
                  onChange={(e) => setProMonthly(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pricing-pro-yearly">Pro / year ($)</Label>
                <Input
                  id="pricing-pro-yearly"
                  type="number"
                  step="0.01"
                  min="0"
                  value={proYearly}
                  onChange={(e) => setProYearly(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pricing-seat">Per seat / month ($)</Label>
                <Input
                  id="pricing-seat"
                  type="number"
                  step="0.01"
                  min="0"
                  value={seatPrice}
                  onChange={(e) => setSeatPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Save pricing
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
