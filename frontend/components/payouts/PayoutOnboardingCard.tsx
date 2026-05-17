import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Banknote, Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { creatorService } from "@/lib/services/creator-service";
import {
  payoutService,
  ACTIVE_PAYOUT_PROVIDERS,
  type ActivePayoutProvider,
  type PayoutOnboardingStatus,
} from "@/lib/services/payout-service";

/**
 * Self-gating payout onboarding card.
 *
 * Returns null when the caller is not an enrolled creator — Settings →
 * Payouts and CreatorWorkspace both embed this unconditionally and let
 * the component decide its own visibility (no prop-drilled `canPayout`
 * the consumer would have to recompute).
 *
 * Handles both rails:
 *   helcim_ach  — opens the HelcimPay verify modal; tokenises the
 *                 recipient's routing + account number; we never see raw
 *                 bank details. The bankToken returned in success
 *                 postMessage is posted to /complete.
 *   tremendous  — inline email input; on submit posts the email straight
 *                 to /complete. Tremendous emails a reward-claim link.
 *
 * Renders the "you're onboarded" success state when payoutsEnabled is true
 * (with masked account hint + a Change link), so the card is permanently
 * embeddable rather than disappearing post-onboarding.
 */
const PROVIDER_LABEL: Record<ActivePayoutProvider, string> = {
  helcim_ach: "Direct deposit (ACH)",
  tremendous: "Gift card (Tremendous)",
  manual: "Manual / off-platform",
};

const PROVIDER_BLURB: Record<ActivePayoutProvider, string> = {
  helcim_ach: "Push funds straight to your US bank account on the next ACH window. Routing + account numbers are tokenised by Helcim — we never store them.",
  tremendous: "Get a claim link by email. Pick from Visa, Amazon, Venmo, PayPal, and 1,000+ other redemption options. Works globally.",
  manual: "An admin moves the funds out-of-band. Use only when neither ACH nor Tremendous fits — e.g. wire transfers for high-value international creators.",
};

export default function PayoutOnboardingCard() {
  const { toast } = useToast();
  const [creatorActive, setCreatorActive] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PayoutOnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<ActivePayoutProvider>("helcim_ach");
  const [tremendousEmail, setTremendousEmail] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([creatorService.getMine(), payoutService.getOnboardingStatus()])
      .then(([c, s]) => {
        if (cancelled) return;
        setCreatorActive(!!c?.isActive);
        setStatus(s);
        if (s.provider) setProvider(s.provider);
      })
      .catch(() => {
        if (!cancelled) {
          setCreatorActive(false);
          setStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Self-gate: only enrolled creators get paid. The wrapping settings page
  // doesn't need to know — return null and stay out of the layout.
  if (loading) return null;
  if (!creatorActive) return null;

  const onboarded = !!status?.payoutsEnabled;

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      if (provider === "helcim_ach") {
        const session = await payoutService.startOnboarding("helcim_ach");
        if (!session.checkoutToken) {
          throw new Error("Helcim did not return a checkout token");
        }
        // The HelcimPay SDK is loaded on demand. The success postMessage
        // carries a bankToken which we forward to /complete.
        await loadHelcimPayJs(session.sdkScriptUrl);
        await openHelcimPayAndComplete(session.checkoutToken);
      } else if (provider === "tremendous") {
        if (!/^[^@]+@[^@]+\.[^@]+$/.test(tremendousEmail.trim())) {
          throw new Error("Enter a valid email address");
        }
        const next = await payoutService.completeOnboarding({
          provider: "tremendous",
          providerAccountId: tremendousEmail.trim(),
        });
        setStatus(next);
        toast({ title: "Tremendous payouts enabled" });
      } else {
        if (!manualReference.trim()) {
          throw new Error("Add a reference admins can use to identify your payouts");
        }
        const next = await payoutService.completeOnboarding({
          provider: "manual",
          providerAccountId: manualReference.trim(),
        });
        setStatus(next);
        toast({ title: "Manual payouts enabled" });
      }
    } catch (e: unknown) {
      toast({
        title: "Couldn't enable payouts",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  async function loadHelcimPayJs(url?: string): Promise<void> {
    if (!url) return;
    const id = "helcim-pay-js-script";
    if (document.getElementById(id)) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load HelcimPay SDK"));
      document.body.appendChild(script);
    });
  }

  async function openHelcimPayAndComplete(checkoutToken: string): Promise<void> {
    // HelcimPay exposes a global `appendHelcimPayIframe` that mounts the
    // modal. On success it postMessages `{ eventName: 'helcim-pay-js-payment',
    // eventStatus: 'SUCCESS', eventMessage: { data: { data: { bankToken, ... }}}}`
    // back to window.
    const w = window as unknown as {
      appendHelcimPayIframe?: (token: string) => void;
      removeHelcimPayIframe?: () => void;
    };
    if (typeof w.appendHelcimPayIframe !== "function") {
      throw new Error("HelcimPay SDK did not initialise");
    }
    w.appendHelcimPayIframe(checkoutToken);

    return new Promise((resolve, reject) => {
      const handler = async (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.eventName !== `helcim-pay-js-${checkoutToken}`) return;
        try {
          if (data.eventStatus === "ABORTED") {
            window.removeEventListener("message", handler);
            w.removeHelcimPayIframe?.();
            reject(new Error("Onboarding cancelled"));
            return;
          }
          if (data.eventStatus !== "SUCCESS") return;
          const inner = data.eventMessage?.data?.data ?? {};
          const bankToken: string | undefined = inner.bankToken ?? inner.cardToken;
          if (!bankToken) {
            window.removeEventListener("message", handler);
            w.removeHelcimPayIframe?.();
            reject(new Error("Helcim did not return a bank token"));
            return;
          }
          const next = await payoutService.completeOnboarding({
            provider: "helcim_ach",
            providerAccountId: bankToken,
            hint: {
              last4: inner.bankLast4 ?? inner.last4,
              bankName: inner.bankName,
              accountType: inner.accountType,
            },
          });
          window.removeEventListener("message", handler);
          w.removeHelcimPayIframe?.();
          setStatus(next);
          toast({ title: "Direct deposit enabled" });
          resolve();
        } catch (e) {
          window.removeEventListener("message", handler);
          w.removeHelcimPayIframe?.();
          reject(e);
        }
      };
      window.addEventListener("message", handler);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          <CardTitle>How we pay you</CardTitle>
        </div>
        <CardDescription>
          Pick a rail once. Your accrued balance is released after the
          payout pipeline runs (a scheduled worker is on the next milestone).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {onboarded && status?.provider && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-medium">
                Payouts enabled via {PROVIDER_LABEL[status.provider]}
              </div>
              <div className="text-xs text-muted-foreground">
                {status.provider === "helcim_ach" && status.accountHint?.last4
                  ? `Direct deposit · ${status.accountHint.bankName ?? "Bank"} ····${status.accountHint.last4}`
                  : status.provider === "tremendous"
                    ? `Reward link to ${status.providerAccountId}`
                    : `Reference: ${status.providerAccountId}`}
                {status.onboardedAt
                  ? ` · since ${new Date(status.onboardedAt).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
          </div>
        )}

        <RadioGroup
          value={provider}
          onValueChange={(v) => setProvider(v as ActivePayoutProvider)}
          className="grid gap-3"
        >
          {ACTIVE_PAYOUT_PROVIDERS.map((p) => (
            <label
              key={p}
              className={`rounded-lg border p-3 cursor-pointer ${provider === p ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value={p} id={`provider-${p}`} />
                <span className="font-medium">{PROVIDER_LABEL[p]}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{PROVIDER_BLURB[p]}</p>
            </label>
          ))}
        </RadioGroup>

        {provider === "tremendous" && (
          <div className="space-y-2">
            <Label htmlFor="tremendous-email">Recipient email *</Label>
            <Input
              id="tremendous-email"
              type="email"
              value={tremendousEmail}
              onChange={(e) => setTremendousEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Mail className="h-3.5 w-3.5 mt-0.5" />
              Each payout sends a fresh claim link to this address.
            </p>
          </div>
        )}

        {provider === "manual" && (
          <div className="space-y-2">
            <Label htmlFor="manual-ref">Reference (visible to admin only) *</Label>
            <Input
              id="manual-ref"
              value={manualReference}
              onChange={(e) => setManualReference(e.target.value)}
              placeholder="e.g. Wise ID, wire details on file with ops"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <FileText className="h-3.5 w-3.5 mt-0.5" />
              Use only when ACH and gift-card rails won't work for you.
            </p>
          </div>
        )}

        {provider === "helcim_ach" && !onboarded && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
            Click below to open Helcim's secure bank-details modal — we
            never see your routing or account number.
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {onboarded ? "Change payout method" : "Enable payouts"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
