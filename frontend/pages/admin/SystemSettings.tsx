import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Save, AlertCircle, Mail, Globe, Bell, Lock, Palette, Loader2 } from "lucide-react";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api-client";

interface SettingSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  general: Globe,
  email: Mail,
  notifications: Bell,
  security: Lock,
  appearance: Palette,
};
const SECTION_IDS = ["general","email","notifications","security","appearance"] as const;

// Key constants for system settings
const SETTING_KEYS = {
  siteName: "site_name",
  supportEmail: "support_email",
  maintenanceMode: "maintenance_mode",
  registrationOpen: "registration_open",
  requireEmailVerification: "require_email_verification",
  smtpHost: "smtp_host",
  smtpPort: "smtp_port",
  fromName: "from_name",
  fromEmail: "from_email",
  sessionTtlHours: "session_ttl_hours",
  impersonationTtlMin: "impersonation_ttl_min",
  maxLoginAttempts: "max_login_attempts",
  notifyNewUser: "notify_new_user",
  notifyNewJob: "notify_new_job",
  notifyFailedPayment: "notify_failed_payment",
  notifyImpersonation: "notify_impersonation",
} as const;

// Defaults used when the DB has no value
const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.siteName]: "hired.video",
  [SETTING_KEYS.supportEmail]: "support@hired.video",
  [SETTING_KEYS.maintenanceMode]: "false",
  [SETTING_KEYS.registrationOpen]: "true",
  [SETTING_KEYS.requireEmailVerification]: "true",
  [SETTING_KEYS.smtpHost]: "smtp.sendgrid.net",
  [SETTING_KEYS.smtpPort]: "587",
  [SETTING_KEYS.fromName]: "hired.video",
  [SETTING_KEYS.fromEmail]: "no-reply@hired.video",
  [SETTING_KEYS.sessionTtlHours]: "24",
  [SETTING_KEYS.impersonationTtlMin]: "60",
  [SETTING_KEYS.maxLoginAttempts]: "5",
  [SETTING_KEYS.notifyNewUser]: "true",
  [SETTING_KEYS.notifyNewJob]: "false",
  [SETTING_KEYS.notifyFailedPayment]: "true",
  [SETTING_KEYS.notifyImpersonation]: "true",
};

function toBool(val: string | null | undefined): boolean {
  return val === "true";
}

export default function SystemSettings() {
  const { t } = useTranslation();
  const SECTIONS: SettingSection[] = [
    { id: "general",  title: t("labels.tabGroupGeneral"),  description: t("messages.coreSettings"),                 icon: Globe   },
    { id: "email",    title: t("fields.email.label"),       description: t("messages.smtpDesc"),                     icon: Mail    },
    { id: "notifications", title: t("headings.notifications"), description: t("messages.notificationsDesc"),       icon: Bell    },
    { id: "security", title: t("tabs.security"),           description: t("messages.sessionAccessControlsDesc"),    icon: Lock    },
    { id: "appearance",title: t("headings.appearance"),    description: t("messages.appearanceDesc"),               icon: Palette },
  ];
  const { toast } = useToast();
  const { can } = useAdminPermissions();
  const canUpdate = can("settings", "update");
  const [activeSection, setActiveSection] = useState("general");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // All settings stored as a flat record
  const [settings, setSettings] = useState<Record<string, string>>({ ...DEFAULTS });
  const [originalSettings, setOriginalSettings] = useState<Record<string, string>>({ ...DEFAULTS });

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Record<string, string | null>>("/api/admin/settings");
      const merged = { ...DEFAULTS };
      for (const [key, value] of Object.entries(res.data)) {
        if (value !== null) merged[key] = value;
      }
      setSettings(merged);
      setOriginalSettings(merged);
      setDirty(false);
    } catch (err) {
      toast({ title: t("errors.failedToLoadSettings"), description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updateBool = (key: string, value: boolean) => update(key, String(value));

  const handleSave = async () => {
    // Only send changed keys
    const changed: Record<string, string> = {};
    for (const key of Object.keys(settings)) {
      if (settings[key] !== originalSettings[key]) {
        changed[key] = settings[key];
      }
    }
    if (Object.keys(changed).length === 0) {
      setDirty(false);
      return;
    }

    try {
      setSaving(true);
      await apiClient.put("/api/admin/settings", changed);
      setOriginalSettings({ ...settings });
      setDirty(false);
      toast({ title: t("status.settingsSaved"), description: t("status.settingsUpdated") });
    } catch (err) {
      toast({ title: t("errors.failedToSaveSettings"), description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        {t("status.loadingSettings")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("headings.systemSettings")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("messages.systemSettingsIntro")}
            {!canUpdate && t("messages.readOnlySuffix")}
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || !canUpdate || saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("actions.saveChanges")}
        </Button>
      </div>

      {dirty && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("status.unsavedChanges")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Section nav */}
        <nav className="flex flex-row lg:flex-col gap-1 lg:w-44 shrink-0 overflow-x-auto">
          {SECTIONS.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors text-left ${
                activeSection === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {title}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="flex-1 space-y-4">
          {activeSection === "general" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("labels.tabGroupGeneral")}</CardTitle>
                <CardDescription>{t("messages.coreSettings")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1.5">
                  <Label>{t("labels.siteName")}</Label>
                  <Input value={settings[SETTING_KEYS.siteName]} onChange={(e) => update(SETTING_KEYS.siteName, e.target.value)} disabled={!canUpdate} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("labels.supportEmail")}</Label>
                  <Input value={settings[SETTING_KEYS.supportEmail]} onChange={(e) => update(SETTING_KEYS.supportEmail, e.target.value)} disabled={!canUpdate} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t("labels.openRegistration")}</Label>
                    <p className="text-xs text-muted-foreground">{t("messages.allowNewSignups")}</p>
                  </div>
                  <Switch checked={toBool(settings[SETTING_KEYS.registrationOpen])} onCheckedChange={(v) => updateBool(SETTING_KEYS.registrationOpen, v)} disabled={!canUpdate} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t("labels.requireEmailVerification")}</Label>
                    <p className="text-xs text-muted-foreground">{t("messages.requireEmailVerificationDesc")}</p>
                  </div>
                  <Switch checked={toBool(settings[SETTING_KEYS.requireEmailVerification])} onCheckedChange={(v) => updateBool(SETTING_KEYS.requireEmailVerification, v)} disabled={!canUpdate} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-destructive">{t("labels.maintenanceMode")}</Label>
                    <p className="text-xs text-muted-foreground">{t("messages.maintenanceModeDesc")}</p>
                  </div>
                  <Switch checked={toBool(settings[SETTING_KEYS.maintenanceMode])} onCheckedChange={(v) => updateBool(SETTING_KEYS.maintenanceMode, v)} disabled={!canUpdate} />
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === "email" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("headings.emailSmtp")}</CardTitle>
                <CardDescription>{t("messages.smtpDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>{t("labels.smtpHost")}</Label>
                    <Input value={settings[SETTING_KEYS.smtpHost]} onChange={(e) => update(SETTING_KEYS.smtpHost, e.target.value)} disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("labels.smtpPort")}</Label>
                    <Input value={settings[SETTING_KEYS.smtpPort]} onChange={(e) => update(SETTING_KEYS.smtpPort, e.target.value)} disabled={!canUpdate} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>{t("labels.fromName")}</Label>
                    <Input value={settings[SETTING_KEYS.fromName]} onChange={(e) => update(SETTING_KEYS.fromName, e.target.value)} disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("labels.fromEmail")}</Label>
                    <Input value={settings[SETTING_KEYS.fromEmail]} onChange={(e) => update(SETTING_KEYS.fromEmail, e.target.value)} disabled={!canUpdate} />
                  </div>
                </div>
                <Button variant="outline" size="sm">{t("actions.sendTestEmail")}</Button>
              </CardContent>
            </Card>
          )}

          {activeSection === "security" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("tabs.security")}</CardTitle>
                <CardDescription>{t("messages.sessionAccessControlsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="grid gap-1.5">
                    <Label>{t("labels.sessionTtlHours")}</Label>
                    <Input value={settings[SETTING_KEYS.sessionTtlHours]} onChange={(e) => update(SETTING_KEYS.sessionTtlHours, e.target.value)} type="number" min="1" disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("labels.impersonationTtlMin")}</Label>
                    <Input value={settings[SETTING_KEYS.impersonationTtlMin]} onChange={(e) => update(SETTING_KEYS.impersonationTtlMin, e.target.value)} type="number" min="5" disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("labels.maxLoginAttempts")}</Label>
                    <Input value={settings[SETTING_KEYS.maxLoginAttempts]} onChange={(e) => update(SETTING_KEYS.maxLoginAttempts, e.target.value)} type="number" min="1" disabled={!canUpdate} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === "notifications" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("headings.adminNotifications")}</CardTitle>
                <CardDescription>{t("messages.notificationsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: t("labels.newUserRegistration"), desc: t("messages.notifyNewUserDesc"), key: SETTING_KEYS.notifyNewUser },
                  { label: t("labels.newJobPosted"),         desc: t("messages.notifyNewJobDesc"),  key: SETTING_KEYS.notifyNewJob },
                  { label: t("labels.failedPayment"),        desc: t("messages.notifyFailedPaymentDesc"), key: SETTING_KEYS.notifyFailedPayment },
                  { label: t("labels.impersonationSession"), desc: t("messages.notifyImpersonationDesc"), key: SETTING_KEYS.notifyImpersonation },
                ].map(({ label, desc, key }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <Label>{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch checked={toBool(settings[key])} onCheckedChange={(v) => updateBool(key, v)} disabled={!canUpdate} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {activeSection === "appearance" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("headings.appearance")}</CardTitle>
                <CardDescription>{t("messages.appearanceDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t("messages.appearanceComingSoon")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
