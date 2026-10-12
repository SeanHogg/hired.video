/**
 * /data-deletion — how to delete your hired.video data, including the access
 * we hold to the social accounts you connected for posting. This is the
 * "Data Deletion Instructions URL" the Meta app (Instagram + Facebook) and
 * the TikTok / X developer consoles ask for.
 *
 * Every step points at a real control: Settings ▸ Account ▸ Delete account
 * (services/user/account.ts deleteAccount — anonymizes the account and
 * deletes every stored social / LinkedIn / YouTube token), Settings ▸
 * Connections ▸ Disconnect (drops one network's token), or a verified email
 * to the DPO for full erasure.
 */
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  LegalPage,
  LegalSection,
  LegalSectionContent,
  LegalSectionDescription,
  LegalSectionHeader,
  LegalSectionTitle,
} from "@/components/legal/LegalDocument";

const PRIVACY_EMAIL = "privacy@hired.video";
const ACCOUNT_SETTINGS_PATH = "/settings?tab=account-billing";
const CONNECTIONS_PATH = "/settings/connections";

/** What account deletion does — the delete dialog's own copy, plus tokens. */
const ACCOUNT_EFFECT_KEYS = [
  "messages.deleteEffect.deactivated",
  "messages.deleteEffect.anonymized",
  "messages.deleteEffect.private",
  "dataDeletion.account.effectConnections",
  "messages.deleteEffect.emailFreed",
] as const;

/** Where each network lists the apps that can act on your account. */
const PLATFORM_REVOKE_KEYS = [
  "dataDeletion.connections.revoke.meta",
  "dataDeletion.connections.revoke.tiktok",
  "dataDeletion.connections.revoke.x",
  "dataDeletion.connections.revoke.linkedin",
  "dataDeletion.connections.revoke.google",
] as const;

export default function DataDeletion() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("dataDeletion.title"), url: "/data-deletion" }]);
  const { isAuthenticated } = useAuth();
  const linkClass = "font-medium text-primary hover:underline";
  /** A settings page, or sign-in that returns to it. */
  const signedInPath = (path: string) =>
    isAuthenticated ? path : `/login?redirectTo=${encodeURIComponent(path)}`;

  return (
    <AppShell bgClassName="bg-background">
      <LegalPage title={t("dataDeletion.title")} intro={t("dataDeletion.intro")}>
        <LegalSection id="delete-account">
          <LegalSectionHeader>
            <LegalSectionTitle>{t("dataDeletion.account.title")}</LegalSectionTitle>
            <LegalSectionDescription>{t("dataDeletion.account.body")}</LegalSectionDescription>
          </LegalSectionHeader>
          <LegalSectionContent>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>{t("dataDeletion.account.step1")}</li>
              <li>{t("dataDeletion.account.step2")}</li>
              <li>{t("dataDeletion.account.step3")}</li>
            </ol>
            <h4>{t("headings.whatHappensOnDelete")}</h4>
            <ul className="list-disc space-y-1.5 pl-5">
              {ACCOUNT_EFFECT_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <Button asChild>
              <Link to={signedInPath(ACCOUNT_SETTINGS_PATH)}>
                {isAuthenticated ? t("dataDeletion.account.cta") : t("dataDeletion.signInCta")}
              </Link>
            </Button>
          </LegalSectionContent>
        </LegalSection>

        <LegalSection id="disconnect">
          <LegalSectionHeader>
            <LegalSectionTitle>{t("dataDeletion.connections.title")}</LegalSectionTitle>
            <LegalSectionDescription>{t("dataDeletion.connections.body")}</LegalSectionDescription>
          </LegalSectionHeader>
          <LegalSectionContent>
            <Button asChild variant="outline">
              <Link to={signedInPath(CONNECTIONS_PATH)}>
                {isAuthenticated ? t("dataDeletion.connections.cta") : t("dataDeletion.signInCta")}
              </Link>
            </Button>
            <p>{t("dataDeletion.connections.revokeIntro")}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {PLATFORM_REVOKE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <p>{t("dataDeletion.connections.postsNote")}</p>
          </LegalSectionContent>
        </LegalSection>

        <LegalSection id="request">
          <LegalSectionHeader>
            <LegalSectionTitle>{t("dataDeletion.request.title")}</LegalSectionTitle>
          </LegalSectionHeader>
          <LegalSectionContent>
            <p>
              {t("dataDeletion.request.body")}{" "}
              <a className={linkClass} href={`mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(t("dataDeletion.request.subject"))}`}>
                {PRIVACY_EMAIL}
              </a>
            </p>
            <p>{t("dataDeletion.request.verify")}</p>
            <p>
              {t("dataDeletion.request.more")}{" "}
              <Link className={linkClass} to="/privacy">
                {t("dataDeletion.request.privacyLink")}
              </Link>
            </p>
          </LegalSectionContent>
        </LegalSection>
      </LegalPage>
    </AppShell>
  );
}
