import { useEffect, useState } from "react";
import { Wallet, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { creatorService } from "@/lib/services/creator-service";
import { payoutService, type PayoutBalanceDTO } from "@/lib/services/payout-service";

/**
 * Self-gating balance card. Returns null for non-creators and for creators
 * whose ledger has never posted an entry — no "$0.00 available" placeholder
 * for users who haven't earned anything yet.
 */
export default function PayoutBalanceCard() {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<PayoutBalanceDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([creatorService.getMine(), payoutService.getBalance()])
      .then(([c, b]) => {
        if (cancelled) return;
        setEligible(!!c?.isActive);
        setBalance(b);
      })
      .catch(() => {
        if (!cancelled) {
          setEligible(false);
          setBalance(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (eligible !== true || !balance) return null;
  // No accruals yet -> nothing to show.
  if (balance.accruedCents === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <CardTitle>Available balance</CardTitle>
        </div>
        <CardDescription>
          Ledger-derived. Available = earned − in-flight payouts − settled
          payouts (± adjustments).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label="Available" cents={balance.availableCents} currency={balance.currency} primary />
          <Stat label="In flight" cents={balance.reservedCents} currency={balance.currency} icon={<Clock className="h-3.5 w-3.5" />} />
          <Stat label="Paid to date" cents={balance.paidCents} currency={balance.currency} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {balance.isAboveThreshold
            ? `You're above the $${(balance.minPayoutThresholdCents / 100).toFixed(2)} minimum — the next scheduled run will queue a payout.`
            : `Min payout threshold: $${(balance.minPayoutThresholdCents / 100).toFixed(2)}. Funds accrue until you cross it.`}
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  cents,
  currency,
  primary,
  icon,
}: {
  label: string;
  cents: number;
  currency: string;
  primary?: boolean;
  icon?: React.ReactNode;
}) {
  const amount = `${currency === "USD" ? "$" : ""}${(cents / 100).toFixed(2)}${currency !== "USD" ? ` ${currency}` : ""}`;
  return (
    <div className={`rounded-lg border p-3 ${primary ? "bg-primary/5 border-primary/20" : ""}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-semibold ${primary ? "text-2xl" : "text-lg"}`}>{amount}</div>
    </div>
  );
}
