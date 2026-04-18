import { useEffect, useState } from "react";
import { Chrome, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/hooks/useSubscription";
import {
  settingsService,
  type ExtensionSettings,
  type ExtensionJobseekerSettings,
  type ExtensionRecruiterSettings,
} from "@/lib/services/settings-service";

/**
 * Tell the hired.video Chrome extensions that their settings changed on
 * the web so the sidepanels re-fetch from the server. auth-bridge.js
 * picks this up and relays through the service worker. No-op when the
 * extension isn't installed.
 */
function notifyExtensionsOfSettingsChange() {
  try {
    window.dispatchEvent(
      new CustomEvent("hired.video:notify-extension", {
        detail: { type: "settings-changed" },
      }),
    );
  } catch {
    // Some browsers restrict CustomEvent construction — soft-fail;
    // the extension will reconcile on its next natural fetch.
  }
}

export function ExtensionsSettings() {
  const { toast } = useToast();
  const { isPremium } = useSubscription();
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService
      .getExtensionSettings()
      .then(setSettings)
      .catch((err) => {
        console.error("Failed to load extension settings", err);
        toast({
          title: "Couldn't load extension settings",
          description: "Try refreshing the page.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  // Keep the web view in sync if the Chrome extension changes its own
  // settings while this tab is open. auth-bridge.js fires this custom
  // event when the extension broadcasts `settings-changed`.
  useEffect(() => {
    const onExtensionEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type !== "settings-changed") return;
      settingsService.getExtensionSettings().then(setSettings).catch(() => {});
    };
    window.addEventListener("hired.video:extension-event", onExtensionEvent);
    return () => window.removeEventListener("hired.video:extension-event", onExtensionEvent);
  }, []);

  const patch = async (
    next: ExtensionSettings,
    patchBody: Partial<{
      jobseeker: Partial<ExtensionJobseekerSettings>;
      recruiter: Partial<ExtensionRecruiterSettings>;
    }>,
  ) => {
    setSettings(next); // optimistic
    setSaving(true);
    try {
      const server = await settingsService.updateExtensionSettings(patchBody);
      setSettings(server);
      notifyExtensionsOfSettingsChange();
    } catch (err) {
      console.error("Failed to save extension settings", err);
      toast({
        title: "Couldn't save setting",
        description: "Please try again.",
        variant: "destructive",
      });
      // Re-fetch authoritative state so the UI doesn't lie.
      settingsService.getExtensionSettings().then(setSettings).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const setJobseeker = <K extends keyof ExtensionJobseekerSettings>(key: K, value: ExtensionJobseekerSettings[K]) => {
    if (!settings) return;
    const next = { ...settings, jobseeker: { ...settings.jobseeker, [key]: value } };
    patch(next, { jobseeker: { [key]: value } as Partial<ExtensionJobseekerSettings> });
  };

  const setRecruiter = <K extends keyof ExtensionRecruiterSettings>(key: K, value: ExtensionRecruiterSettings[K]) => {
    if (!settings) return;
    const next = { ...settings, recruiter: { ...settings.recruiter, [key]: value } };
    patch(next, { recruiter: { [key]: value } as Partial<ExtensionRecruiterSettings> });
  };

  if (loading || !settings) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const js = settings.jobseeker;
  const rc = settings.recruiter;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Chrome className="h-5 w-5" />
                Chrome Extensions
              </CardTitle>
              <CardDescription>
                Preferences for the hired.video browser extensions. Changes
                sync automatically to any open extension side panel.
              </CardDescription>
            </div>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job Seeker</CardTitle>
          <CardDescription>
            Automations and download preferences for the Job Seeker side panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            id="js-auto-detect"
            label="Auto-detect job pages"
            description="Show a Tailor & Save banner whenever you're on a job posting."
            checked={js.autoDetect}
            onChange={(v) => setJobseeker("autoDetect", v)}
          />
          <ToggleRow
            id="js-auto-score"
            label="Auto-score on detect"
            description="Run match analysis as soon as a job is detected, so the score is ready when you click."
            checked={js.autoScore}
            onChange={(v) => setJobseeker("autoScore", v)}
            pro
            isPremium={isPremium}
          />
          <ToggleRow
            id="js-auto-tailor"
            label="Auto-tailor on detect"
            description="Generate the tailored resume in the background — just click Save when you're ready."
            checked={js.autoTailor}
            onChange={(v) => setJobseeker("autoTailor", v)}
            pro
            isPremium={isPremium}
          />
          <ToggleRow
            id="js-wizard"
            label="Wizard mode"
            description="Restore the manual 3-step Track → Score → Tailor flow."
            checked={js.wizardMode}
            onChange={(v) => setJobseeker("wizardMode", v)}
          />
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="js-download-format">Download format</Label>
              <p className="text-sm text-muted-foreground">
                Default format when downloading tailored resumes.
              </p>
            </div>
            <Select
              value={js.downloadFormat}
              onValueChange={(v) => setJobseeker("downloadFormat", v)}
            >
              <SelectTrigger id="js-download-format" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">Word</SelectItem>
                <SelectItem value="txt">Plain text</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recruiter</CardTitle>
          <CardDescription>
            Detection preferences for the Recruiter side panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            id="rc-detect-jobs"
            label="Auto-detect job pages"
            description="Surface matching candidates when you land on a job posting."
            checked={rc.autoDetectJobs}
            onChange={(v) => setRecruiter("autoDetectJobs", v)}
            pro
            isPremium={isPremium}
          />
          <ToggleRow
            id="rc-detect-profiles"
            label="Auto-detect profile pages"
            description="Surface outreach suggestions when viewing a candidate profile."
            checked={rc.autoDetectProfiles}
            onChange={(v) => setRecruiter("autoDetectProfiles", v)}
            pro
            isPremium={isPremium}
          />
          <ToggleRow
            id="rc-detect-companies"
            label="Auto-detect company pages"
            description="Pull company enrichment data when browsing a company page."
            checked={rc.autoDetectCompanies}
            onChange={(v) => setRecruiter("autoDetectCompanies", v)}
            pro
            isPremium={isPremium}
          />
          <ToggleRow
            id="rc-auto-score"
            label="Auto-score detected jobs"
            description="Run match analysis as soon as a job is detected."
            checked={rc.autoScore}
            onChange={(v) => setRecruiter("autoScore", v)}
            pro
            isPremium={isPremium}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install the extensions</CardTitle>
          <CardDescription>
            Get the side-panel tools that power these settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://chromewebstore.google.com/search/hired.video%20job%20seeker"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Chrome className="h-4 w-4 mr-2" />
              Job Seeker
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://chromewebstore.google.com/search/hired.video%20recruiter"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Chrome className="h-4 w-4 mr-2" />
              Recruiter
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  pro?: boolean;
  isPremium?: boolean;
}

function ToggleRow({ id, label, description, checked, onChange, pro, isPremium }: ToggleRowProps) {
  const locked = pro && !isPremium;
  return (
    <div className={`flex items-center justify-between gap-4 ${locked ? "opacity-70" : ""}`}>
      <div className="space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-2">
          {label}
          {pro && (
            <Badge
              variant={isPremium ? "default" : "secondary"}
              className="text-[10px] uppercase tracking-wider px-1.5 py-0"
            >
              Pro
            </Badge>
          )}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={locked}
      />
    </div>
  );
}
