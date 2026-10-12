import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import affiliateService from "@/lib/services/affiliate-service";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  variant?: "default" | "compact";
}

// Self-fetches the affiliate profile and renders the referral link + copy
// control. Returns null when the caller isn't enrolled (or fetch fails) so
// consumers don't need to gate on affiliate status.
export default function ReferralLinkBox({ variant = "default" }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    affiliateService
      .getProfile()
      .then((p) => setReferralCode(p.referralCode))
      .catch(() => setReferralCode(null));
  }, []);

  if (!referralCode) return null;

  const link = `${window.location.origin}/signup?ref=${referralCode}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: t("messages.linkCopiedTitle"),
        description: t("messages.referralLinkCopied"),
      });
    } catch (err) {
      console.error("Failed to copy referral link:", err);
      toast({
        title: t("errors.copyFailed"),
        description: t("errors.copyReferralLinkFailed"),
        variant: "destructive",
      });
    }
  };

  if (variant === "compact") {
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("headings.yourReferralLink")}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            readOnly
            className="flex-1 min-w-0 border rounded px-2 py-1 text-[11px] bg-muted/30"
            value={link}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={copy}
            className="h-7 px-2 shrink-0"
            title={t("actions.copyLink")}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          value={link}
          readOnly
        />
        <Button type="button" onClick={copy}>
          {t("actions.copyLink")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {t("messages.referralCommissionHint")}
      </p>
    </div>
  );
}
