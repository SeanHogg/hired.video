// Signed-out views of /settings. Two pitches:
//   - InboxSyncPitch: reached from the /tools "Inbox Sync" tile
//     (/settings?tab=email). Auth links carry the current path through
//     signup/login (gap #762) so the visitor lands back here.
//   - SettingsPitch: the generic "customize your experience" page.

import { useTranslation } from "react-i18next";
import { Bell, Lock, Mail, Palette, Shield, Sliders, Target, User, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { FeatureCardGrid } from "@/components/app-marketing/FeatureCardGrid";
import { buildAuthLinkTo } from "@/lib/auth-redirect";

export function InboxSyncPitch({ currentPathWithSearch }: { currentPathWithSearch: string }) {
  const { t } = useTranslation();
  return (
    <AppShell bgClassName="bg-background">
      <main>
        <SeoHero
          eyebrow={t("headings.inboxSync")}
          title={t("headings.connectYourInbox")}
          lede={t("messages.inboxSyncIntro")}
          primary={{ to: buildAuthLinkTo("/signup", currentPathWithSearch), label: t("actions.signUpToConnect") }}
          secondary={{ to: buildAuthLinkTo("/login", currentPathWithSearch), label: t("actions.signIn") }}
        />
        <div className="mx-auto w-full max-w-[1200px] px-6 pb-20">
          <FeatureCardGrid
            items={[1, 2, 3].map((n) => ({
              key: `inbox-${n}`,
              icon: Mail,
              title: t(`headings.inboxSyncFeature${n}`),
            }))}
          />
        </div>
      </main>
    </AppShell>
  );
}

export function SettingsPitch() {
  const { t } = useTranslation();
  return (
    <AppShell bgClassName="bg-background">
      <main>
        <SeoHero
          eyebrow={t("messages.smartSettings")}
          title={t("headings.customizeYourExperience")}
          lede={t("messages.customizeIntro")}
          primary={{ to: "/signup", label: t("actions.startCustomizing") }}
          secondary={{ to: "/login", label: t("actions.signIn") }}
        />

        <div className="mx-auto w-full max-w-[1200px] px-6 pb-20">
          <FeatureCardGrid
            items={[
              { key: "profile", icon: User, title: t("headings.profileManagement"), description: t("messages.profileManagementDesc") },
              { key: "privacy", icon: Shield, title: t("headings.privacyAndSecurity"), description: t("messages.privacyAndSecurityDesc") },
              { key: "notifications", icon: Bell, title: t("headings.smartNotifications"), description: t("messages.smartNotificationsDesc") },
            ]}
          />
        </div>

        <MarketingBand tone="card" labelledBy="settings-why-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="settings-why-title" title={t("headings.whyOurSettingsMatter")} />
          <FeatureCardGrid
            items={[
              { key: "granular", icon: Sliders, title: t("headings.granularControl"), description: t("messages.granularControlDesc") },
              { key: "privacyFirst", icon: Lock, title: t("headings.privacyFirst"), description: t("messages.privacyFirstDesc") },
              { key: "instant", icon: Zap, title: t("headings.instantUpdates"), description: t("messages.instantUpdatesDesc") },
              { key: "defaults", icon: Target, title: t("headings.smartDefaults"), description: t("messages.smartDefaultsDesc") },
            ]}
          />
        </MarketingBand>

        <MarketingBand labelledBy="settings-categories-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="settings-categories-title" title={t("headings.comprehensiveSettings")} />
          <FeatureCardGrid
            minCardWidth={220}
            items={[
              { key: "profile", icon: User, title: t("headings.profile"), description: t("messages.profileCategoryDesc") },
              { key: "notifications", icon: Bell, title: t("headings.notifications"), description: t("messages.notificationsCategoryDesc") },
              { key: "privacy", icon: Shield, title: t("headings.privacy"), description: t("messages.privacyCategoryDesc") },
              { key: "appearance", icon: Palette, title: t("headings.appearance"), description: t("messages.appearanceCategoryDesc") },
              { key: "inbox", icon: Mail, title: t("headings.inboxSync"), description: t("messages.inboxSyncCategoryDesc") },
            ]}
          />
        </MarketingBand>

        <SeoFinalCta
          id="settings"
          title={t("headings.readyToTakeControl")}
          body={t("messages.readyToTakeControlBody")}
          primary={{ to: "/signup", label: t("actions.getStartedFree") }}
        />
      </main>
    </AppShell>
  );
}
