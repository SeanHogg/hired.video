import React, { useState, useEffect, useCallback } from "react";
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

const SECTIONS: SettingSection[] = [
  { id: "general",  title: "General",        description: "Site name, URL, and basic configuration.",    icon: Globe   },
  { id: "email",    title: "Email",           description: "SMTP and transactional email settings.",      icon: Mail    },
  { id: "notifications", title: "Notifications", description: "System notification triggers.",           icon: Bell    },
  { id: "security", title: "Security",        description: "Auth, sessions, and access controls.",        icon: Lock    },
  { id: "appearance",title: "Appearance",     description: "Branding and UI customization.",              icon: Palette },
];

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
      toast({ title: "Failed to load settings", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      toast({ title: "Settings saved", description: "System settings have been updated." });
    } catch (err) {
      toast({ title: "Failed to save settings", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-muted-foreground text-sm">
            Platform-wide configuration and defaults.
            {!canUpdate && " You have read-only access."}
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || !canUpdate || saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      {dirty && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>You have unsaved changes.</AlertDescription>
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
                <CardTitle className="text-base">General</CardTitle>
                <CardDescription>Core platform settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1.5">
                  <Label>Site Name</Label>
                  <Input value={settings[SETTING_KEYS.siteName]} onChange={(e) => update(SETTING_KEYS.siteName, e.target.value)} disabled={!canUpdate} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Support Email</Label>
                  <Input value={settings[SETTING_KEYS.supportEmail]} onChange={(e) => update(SETTING_KEYS.supportEmail, e.target.value)} disabled={!canUpdate} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Open Registration</Label>
                    <p className="text-xs text-muted-foreground">Allow new users to sign up.</p>
                  </div>
                  <Switch checked={toBool(settings[SETTING_KEYS.registrationOpen])} onCheckedChange={(v) => updateBool(SETTING_KEYS.registrationOpen, v)} disabled={!canUpdate} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Email Verification</Label>
                    <p className="text-xs text-muted-foreground">New accounts must verify their email before access.</p>
                  </div>
                  <Switch checked={toBool(settings[SETTING_KEYS.requireEmailVerification])} onCheckedChange={(v) => updateBool(SETTING_KEYS.requireEmailVerification, v)} disabled={!canUpdate} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-destructive">Maintenance Mode</Label>
                    <p className="text-xs text-muted-foreground">Take the platform offline for non-admins.</p>
                  </div>
                  <Switch checked={toBool(settings[SETTING_KEYS.maintenanceMode])} onCheckedChange={(v) => updateBool(SETTING_KEYS.maintenanceMode, v)} disabled={!canUpdate} />
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === "email" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email / SMTP</CardTitle>
                <CardDescription>Transactional email configuration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>SMTP Host</Label>
                    <Input value={settings[SETTING_KEYS.smtpHost]} onChange={(e) => update(SETTING_KEYS.smtpHost, e.target.value)} disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>SMTP Port</Label>
                    <Input value={settings[SETTING_KEYS.smtpPort]} onChange={(e) => update(SETTING_KEYS.smtpPort, e.target.value)} disabled={!canUpdate} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>From Name</Label>
                    <Input value={settings[SETTING_KEYS.fromName]} onChange={(e) => update(SETTING_KEYS.fromName, e.target.value)} disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>From Email</Label>
                    <Input value={settings[SETTING_KEYS.fromEmail]} onChange={(e) => update(SETTING_KEYS.fromEmail, e.target.value)} disabled={!canUpdate} />
                  </div>
                </div>
                <Button variant="outline" size="sm">Send Test Email</Button>
              </CardContent>
            </Card>
          )}

          {activeSection === "security" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Security</CardTitle>
                <CardDescription>Session and access control settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Session TTL (hours)</Label>
                    <Input value={settings[SETTING_KEYS.sessionTtlHours]} onChange={(e) => update(SETTING_KEYS.sessionTtlHours, e.target.value)} type="number" min="1" disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Impersonation TTL (minutes)</Label>
                    <Input value={settings[SETTING_KEYS.impersonationTtlMin]} onChange={(e) => update(SETTING_KEYS.impersonationTtlMin, e.target.value)} type="number" min="5" disabled={!canUpdate} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Max Login Attempts</Label>
                    <Input value={settings[SETTING_KEYS.maxLoginAttempts]} onChange={(e) => update(SETTING_KEYS.maxLoginAttempts, e.target.value)} type="number" min="1" disabled={!canUpdate} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === "notifications" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin Notifications</CardTitle>
                <CardDescription>Which events trigger an email to admins.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "New User Registration", desc: "Alert when a new account is created.", key: SETTING_KEYS.notifyNewUser },
                  { label: "New Job Posted",         desc: "Alert when a job is published.",      key: SETTING_KEYS.notifyNewJob },
                  { label: "Failed Payment",         desc: "Alert on subscription payment failure.", key: SETTING_KEYS.notifyFailedPayment },
                  { label: "Impersonation Session",  desc: "Alert when a SuperAdmin starts impersonation.", key: SETTING_KEYS.notifyImpersonation },
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
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>Branding and visual customization. Full editor coming soon.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Custom logo upload, color palette, and white-label settings will be available here.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
