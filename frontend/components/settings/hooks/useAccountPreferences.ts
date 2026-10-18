import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { applyLocale } from "@/lib/i18n/i18n";
import {
  settingsService,
  type AccountSettings,
  type PrivacySettings,
} from "@/lib/services/settings-service";

export type NotificationChannel = "email" | "push" | "weekly";
export type NotificationToggles = Record<NotificationChannel, boolean>;

/** Privacy flags saved one-at-a-time (no backend echo merge). */
export type LocalPrivacyFlag = "showEmail" | "showPhone" | "showLocation";

const LOCAL_PRIVACY_FLAG_LOG_LABEL: Record<LocalPrivacyFlag, string> = {
  showEmail: "show email",
  showPhone: "show phone",
  showLocation: "show location",
};

/**
 * Notifications + Privacy + Appearance settings for /settings. One load
 * on auth (same three calls, same order) plus the per-field save handlers.
 */
export function useAccountPreferences(isAuthenticated: boolean) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationToggles>({
    email: true,
    push: true,
    weekly: true,
  });

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profileVisible: true,
    showEmail: false,
    showPhone: false,
    showLocation: false,
    indexable: true,
    allowMessages: true,
    showActivity: true,
  });
  const [appearance, setAppearance] = useState<AccountSettings>({
    theme: "system",
    language: "en",
    timezone: "UTC",
  });
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Load privacy settings from API
    settingsService
      .getPrivacySettings()
      .then((p) => {
        setPrivacy((prev) => ({
          ...prev,
          profileVisible: p.profileVisible,
          indexable: p.indexable,
          allowMessages: p.allowMessages ?? prev.allowMessages,
          showActivity: p.showActivity ?? prev.showActivity,
          showEmail: p.showEmail ?? prev.showEmail,
          showPhone: p.showPhone ?? prev.showPhone,
          showLocation: p.showLocation ?? prev.showLocation,
        }));
      })
      .catch((err) => {
        console.error("Failed to load privacy settings", err);
      });

    // Load notification settings from API
    settingsService
      .getNotificationSettings()
      .then((n) => setNotifications({
        email: n.email,
        push: n.push,
        weekly: n.weekly,
      }))
      .catch((err) => {
        console.error("Failed to load notification settings", err);
      });

    // Load account (appearance) settings from API
    settingsService
      .getAccountSettings()
      .then((a) => setAppearance((prev) => ({
        ...prev,
        theme: a.theme ?? prev.theme,
        language: a.language ?? prev.language,
        timezone: a.timezone ?? prev.timezone,
      })))
      .catch((err) => {
        console.error("Failed to load account settings", err);
      });

  }, [isAuthenticated]);

  const setNotificationChannel = async (channel: NotificationChannel, checked: boolean) => {
    setNotifications({ ...notifications, [channel]: checked });
    try {
      const patch: Partial<NotificationToggles> = {};
      patch[channel] = checked;
      await settingsService.updateNotificationSettings(patch);
    } catch (e) {
      console.error(`Failed to save notifications (${channel})`, e);
    }
  };

  const savePrivacyPatch = async (patch: Partial<PrivacySettings>) => {
    try {
      setSavingPrivacy(true);
      // Merge patch into local state first for responsive UI
      const merged: PrivacySettings = { ...privacy, ...patch };
      setPrivacy(merged);

      // Persist only the fields supported by backend
      const updated = await settingsService.updatePrivacySettings({
        profileVisible: merged.profileVisible,
        indexable: merged.indexable,
        allowMessages: merged.allowMessages,
        showActivity: merged.showActivity,
      });

      // Reflect backend-confirmed values; keep other local-only flags
      setPrivacy((prev) => ({ ...prev, ...updated }));
    } catch (error) {
      console.error("Failed to save privacy settings", error);
      toast({ title: t("errors.savePrivacyFailed"), variant: "destructive" });
    } finally {
      setSavingPrivacy(false);
    }
  };

  const setLocalPrivacyFlag = async (flag: LocalPrivacyFlag, checked: boolean) => {
    setPrivacy({ ...privacy, [flag]: checked });
    try {
      const patch: Partial<PrivacySettings> = {};
      patch[flag] = checked;
      await settingsService.updatePrivacySettings(patch);
    } catch (e) {
      console.error(`Failed to save privacy (${LOCAL_PRIVACY_FLAG_LOG_LABEL[flag]})`, e);
    }
  };

  const setAppearanceTheme = (theme: AccountSettings["theme"]) => {
    setAppearance({ ...appearance, theme });
  };

  const setLanguage = async (value: string) => {
    setAppearance({ ...appearance, language: value });
    // Switch the live UI immediately so the user sees
    // the change before the round-trip resolves.
    applyLocale(value);
    try {
      await settingsService.updateAccountSettings({ language: value });
    } catch (e) {
      console.error("Failed to save appearance (language)", e);
    }
  };

  const setTimezone = async (value: string) => {
    setAppearance({ ...appearance, timezone: value });
    try {
      await settingsService.updateAccountSettings({ timezone: value });
    } catch (e) {
      console.error("Failed to save appearance (timezone)", e);
    }
  };

  return {
    notifications,
    setNotificationChannel,
    privacy,
    savingPrivacy,
    savePrivacyPatch,
    setLocalPrivacyFlag,
    appearance,
    setAppearanceTheme,
    setLanguage,
    setTimezone,
  };
}
