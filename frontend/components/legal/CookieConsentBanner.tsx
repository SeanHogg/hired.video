/**
 * CookieConsentBanner — slide-in banner that gates analytics/marketing/
 * personalization cookies until the visitor makes a choice. Self-gates by
 * reading [useCookiePreferences](../../hooks/use-cookie-preferences.ts) per
 * the standing DRY rule — App.tsx mounts it unconditionally and the
 * component decides whether to render.
 *
 * Hidden when:
 *   - The hook is still loading (no flash before we know the server choice)
 *   - The user has already made a choice (`consentedAt` set, either via the
 *     banner or via Settings → Cookies or via the GPC implicit reject)
 *
 * The banner is purely informational + actionable; the actual fan-out to
 * Google Consent Mode v2 happens inside the hook's `commit()` via
 * `applyConsentToTagManagers`. This component never touches gtag directly.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Cookie, Settings as SettingsIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const { loading, hasConsented, acceptAll, rejectOptional, setCategory, preferences } =
    useCookiePreferences();
  const [showDetails, setShowDetails] = useState(false);

  if (loading || hasConsented) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border bg-background shadow-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Cookie className="h-6 w-6 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="cookie-consent-title" className="text-base font-semibold">
              {t("cookieBanner.title", "We use cookies")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "cookieBanner.body",
                "Essential cookies keep hired.video working. With your permission, we'd also use analytics and marketing cookies to improve the product and personalize what you see. You can change this any time in Settings.",
              )}{" "}
              <Link to="/cookies" className="underline hover:text-foreground">
                {t("cookieBanner.policyLink", "Cookie policy")}
              </Link>
              {" · "}
              <Link to="/privacy" className="underline hover:text-foreground">
                {t("cookieBanner.privacyLink", "Privacy policy")}
              </Link>
            </p>

            {showDetails && (
              <div className="mt-4 space-y-3 rounded-lg border bg-muted/40 p-3">
                <DetailRow
                  label={t("cookieBanner.essential", "Essential")}
                  description={t(
                    "cookieBanner.essentialDesc",
                    "Required for sign-in and core functionality. Always on.",
                  )}
                  checked
                  disabled
                />
                <DetailRow
                  label={t("cookieBanner.analytics", "Analytics")}
                  description={t(
                    "cookieBanner.analyticsDesc",
                    "Aggregated usage data so we can fix bugs and improve features.",
                  )}
                  checked={preferences.analytics}
                  onChange={(v) => setCategory("analytics", v)}
                />
                <DetailRow
                  label={t("cookieBanner.marketing", "Marketing")}
                  description={t(
                    "cookieBanner.marketingDesc",
                    "Pixels for ads we run, so we can measure which campaigns send useful traffic.",
                  )}
                  checked={preferences.marketing}
                  onChange={(v) => setCategory("marketing", v)}
                />
                <DetailRow
                  label={t("cookieBanner.personalization", "Personalization")}
                  description={t(
                    "cookieBanner.personalizationDesc",
                    "Remembers what you've looked at so recommendations feel less random.",
                  )}
                  checked={preferences.personalization}
                  onChange={(v) => setCategory("personalization", v)}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void acceptAll()}>
                {t("cookieBanner.acceptAll", "Accept all")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void rejectOptional()}>
                {t("cookieBanner.rejectOptional", "Reject optional")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDetails((s) => !s)}
                aria-expanded={showDetails}
              >
                <SettingsIcon className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {showDetails
                  ? t("cookieBanner.hideDetails", "Hide details")
                  : t("cookieBanner.customize", "Customize")}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void rejectOptional()}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={t("cookieBanner.dismiss", "Reject optional cookies and dismiss")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = `cookie-cat-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange?.(!!v)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
