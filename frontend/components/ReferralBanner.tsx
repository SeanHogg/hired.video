// ReferralBanner — in-product referral loop shown on the dashboard.
// "Give a friend 1 month free, get 1 month free."
// Dismissable via localStorage. Fetches referral code from affiliate service.

import { useState, useEffect } from "react";
import { Gift, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useApiReady } from "@/lib/auth";
import affiliateService from "@/lib/services/affiliate-service";

const DISMISS_KEY = "referral_banner_dismissed_v1";

export default function ReferralBanner() {
  const apiReady = useApiReady();
  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(localStorage.getItem(DISMISS_KEY)); } catch { return false; }
  });
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (dismissed || !apiReady) return;
    affiliateService.getProfile().then((p) => setReferralCode(p.referralCode)).catch(() => {});
  }, [apiReady, dismissed]);

  // Self-gate: anonymous viewers and verification-blocked users have no
  // referral profile to show; the banner returns null instead of pushing
  // a dismiss-state onto users who can't even sign in yet.
  if (dismissed || !apiReady) return null;

  const referralLink = referralCode
    ? `${window.location.origin}/signup?ref=${referralCode}`
    : null;

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  };

  return (
    <div className="relative rounded-xl border border-primary/30 bg-accent/50 px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-start gap-3 flex-1">
        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-full bg-brand-primary/15 flex items-center justify-center">
          <Gift className="h-5 w-5 text-brand-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Give a friend 1 month free — get 1 month free</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Share your referral link. When they subscribe, you both get a free month.{" "}
            <Link to="/affiliate-program" className="text-primary underline underline-offset-2">Learn more</Link>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {referralLink ? (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>
        ) : (
          <Link to="/affiliate-program">
            <Button size="sm" variant="outline" className="h-8 text-xs">Get your link</Button>
          </Link>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
