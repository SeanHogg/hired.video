import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/services/auth-service";

interface Props {
  /** Wrap in its own Card for standalone placement (default), or false to
   *  join an existing list of toggle rows. Mirrors PromoteWithoutAuthToggle. */
  asCard?: boolean;
}

/**
 * Confidential search mode toggle (#1627) — Settings → Privacy. When on,
 * the profile is excluded from the public people directory (fail-closed)
 * so senior execs who are still employed aren't seen job-hunting. Reads +
 * persists its own value via authService.updateProfile so any host can
 * drop it in without prop-drilling state. Self-contained per DRY rule.
 */
export default function ConfidentialModeToggle({ asCard = true }: Props = {}) {
  const { toast } = useToast();
  const [value, setValue] = useState(false);
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [companyDraft, setCompanyDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authService
      .getCurrentUser()
      .then((u) => {
        if (cancelled) return;
        setValue(Boolean(u.confidentialMode));
        setBlocklist(u.confidentialBlocklist ?? []);
      })
      .catch(() => { /* leave default; user can still toggle to set */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const persistBlocklist = async (next: string[]) => {
    const previous = blocklist;
    setBlocklist(next);
    try {
      await authService.updateProfile({ confidentialBlocklist: next });
    } catch {
      setBlocklist(previous);
      toast({ title: "Couldn't update blocklist", variant: "destructive" });
    }
  };

  const addCompany = () => {
    const name = companyDraft.trim();
    if (!name) return;
    if (blocklist.some((b) => b.toLowerCase() === name.toLowerCase())) {
      setCompanyDraft("");
      return;
    }
    setCompanyDraft("");
    void persistBlocklist([...blocklist, name]);
  };

  const onChange = async (next: boolean) => {
    const previous = value;
    setSaving(true);
    setValue(next);
    try {
      const updated = await authService.updateProfile({ confidentialMode: next });
      setValue(Boolean(updated.confidentialMode));
    } catch {
      setValue(previous);
      toast({ title: "Couldn't update confidential mode", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const row = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Confidential search</Label>
          <p className="text-sm text-muted-foreground">
            Hide your profile from the public people directory and search. You can still
            apply to jobs and message — you just won't show up when others browse or search
            candidates. Built for execs who are still employed.
          </p>
        </div>
        <Switch checked={value} disabled={!loaded || saving} onCheckedChange={onChange} />
      </div>

      {/* Employer blocklist (#1679) — shown whenever the user has set it OR
          confidential mode is on. Hides the profile from recruiters AT
          these companies (e.g. current employer) while staying visible to
          all other recruiters. */}
      {(value || blocklist.length > 0) && (
        <div className="space-y-2 rounded-md border p-3">
          <Label className="text-sm font-medium">Hide from these employers</Label>
          <p className="text-xs text-muted-foreground">
            Recruiters at these companies won't see you in candidate search — everyone else still can.
          </p>
          <div className="flex gap-2">
            <Input
              value={companyDraft}
              onChange={(e) => setCompanyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompany())}
              placeholder="Company name…"
              disabled={!loaded}
            />
            <Button type="button" variant="outline" onClick={addCompany} disabled={!loaded || !companyDraft.trim()}>
              Add
            </Button>
          </div>
          {blocklist.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {blocklist.map((b) => (
                <Badge key={b} variant="secondary" className="gap-1">
                  {b}
                  <button
                    type="button"
                    aria-label={`Remove ${b}`}
                    onClick={() => void persistBlocklist(blocklist.filter((x) => x !== b))}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!asCard) return row;
  return (
    <Card>
      <CardContent className="p-5">{row}</CardContent>
    </Card>
  );
}
