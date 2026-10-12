// Public email preference center, reached from the token link in any marketing
// email footer (/email-preferences/:token). No login required — the opaque
// token is the bearer credential. Reuses the same <EmailPreferencesPanel> the
// authenticated Settings page uses.
//
// eslint-page-chrome: skip — token-keyed public utility page reached from an
// email link; no breadcrumbs/SEO surface needed.
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { EmailPreferencesPanel } from "@/components/email/EmailPreferencesPanel";

export default function EmailPreferences() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-6 pb-24 pt-12 sm:pt-16">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-[clamp(32px,4vw,48px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
            {t("headings.marketingEmailPreferences")}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t("emailPreferences.subtitle")}
          </p>
        </header>
        {token ? (
          <EmailPreferencesPanel token={token} />
        ) : (
          <p className="text-muted-foreground">{t("emailPreferences.missingToken")}</p>
        )}
      </main>
    </AppShell>
  );
}
