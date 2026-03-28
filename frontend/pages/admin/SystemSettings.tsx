import React, { useState } from "react";
import { Save, AlertCircle, Mail, Globe, Bell, Lock, Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";

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

export default function SystemSettings() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("general");
  const [dirty, setDirty] = useState(false);

  // General settings state
  const [siteName, setSiteName] = useState("hired.video");
  const [supportEmail, setSupportEmail] = useState("support@hired.video");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);

  // Email settings state
  const [smtpHost, setSmtpHost] = useState("smtp.sendgrid.net");
  const [smtpPort, setSmtpPort] = useState("587");
  const [fromName, setFromName] = useState("hired.video");
  const [fromEmail, setFromEmail] = useState("no-reply@hired.video");

  // Security settings
  const [sessionTtlHours, setSessionTtlHours] = useState("24");
  const [impersonationTtlMin, setImpersonationTtlMin] = useState("60");
  const [maxLoginAttempts, setMaxLoginAttempts] = useState("5");

  // Notification settings
  const [notifyNewUser, setNotifyNewUser] = useState(true);
  const [notifyNewJob, setNotifyNewJob] = useState(false);
  const [notifyFailedPayment, setNotifyFailedPayment] = useState(true);
  const [notifyImpersonation, setNotifyImpersonation] = useState(true);

  const handleSave = () => {
    setDirty(false);
    toast({ title: "Settings saved", description: "System settings have been updated." });
  };

  const mark = () => setDirty(true);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-muted-foreground text-sm">Platform-wide configuration and defaults.</p>
        </div>
        <Button onClick={handleSave} disabled={!dirty} className="gap-1.5">
          <Save className="h-4 w-4" />
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
                  <Input value={siteName} onChange={(e) => { setSiteName(e.target.value); mark(); }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Support Email</Label>
                  <Input value={supportEmail} onChange={(e) => { setSupportEmail(e.target.value); mark(); }} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Open Registration</Label>
                    <p className="text-xs text-muted-foreground">Allow new users to sign up.</p>
                  </div>
                  <Switch checked={registrationOpen} onCheckedChange={(v) => { setRegistrationOpen(v); mark(); }} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Email Verification</Label>
                    <p className="text-xs text-muted-foreground">New accounts must verify their email before access.</p>
                  </div>
                  <Switch checked={requireEmailVerification} onCheckedChange={(v) => { setRequireEmailVerification(v); mark(); }} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-destructive">Maintenance Mode</Label>
                    <p className="text-xs text-muted-foreground">Take the platform offline for non-admins.</p>
                  </div>
                  <Switch checked={maintenanceMode} onCheckedChange={(v) => { setMaintenanceMode(v); mark(); }} />
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
                    <Input value={smtpHost} onChange={(e) => { setSmtpHost(e.target.value); mark(); }} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>SMTP Port</Label>
                    <Input value={smtpPort} onChange={(e) => { setSmtpPort(e.target.value); mark(); }} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>From Name</Label>
                    <Input value={fromName} onChange={(e) => { setFromName(e.target.value); mark(); }} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>From Email</Label>
                    <Input value={fromEmail} onChange={(e) => { setFromEmail(e.target.value); mark(); }} />
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
                    <Input value={sessionTtlHours} onChange={(e) => { setSessionTtlHours(e.target.value); mark(); }} type="number" min="1" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Impersonation TTL (minutes)</Label>
                    <Input value={impersonationTtlMin} onChange={(e) => { setImpersonationTtlMin(e.target.value); mark(); }} type="number" min="5" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Max Login Attempts</Label>
                    <Input value={maxLoginAttempts} onChange={(e) => { setMaxLoginAttempts(e.target.value); mark(); }} type="number" min="1" />
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
                  { label: "New User Registration", desc: "Alert when a new account is created.", value: notifyNewUser, set: setNotifyNewUser },
                  { label: "New Job Posted",         desc: "Alert when a job is published.",      value: notifyNewJob,  set: setNotifyNewJob  },
                  { label: "Failed Payment",         desc: "Alert on subscription payment failure.", value: notifyFailedPayment, set: setNotifyFailedPayment },
                  { label: "Impersonation Session",  desc: "Alert when a SuperAdmin starts impersonation.", value: notifyImpersonation, set: setNotifyImpersonation },
                ].map(({ label, desc, value, set }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <Label>{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch checked={value} onCheckedChange={(v) => { set(v); mark(); }} />
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
