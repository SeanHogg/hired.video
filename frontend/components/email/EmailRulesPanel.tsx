/**
 * Rules panel for the Email connections page — user-authored
 * classification rules that run before the AI classifier.
 *
 * Owns its own rule list state + add/delete/toggle handlers. Sibling
 * <EmailInboxesPanel> owns accounts + sync runs; the two panels share
 * nothing at runtime so each tab pays for its own data only on first
 * open.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import {
  emailIntegrationService,
  type EmailUserRule,
} from "@/lib/services/email-integration-service";

const RULE_FIELDS = [
  { value: "from_email", label: "Sender email" },
  { value: "from_domain", label: "Sender domain" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
  { value: "any", label: "Anywhere" },
] as const;

const RULE_OPS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "regex", label: "matches regex" },
] as const;

const RULE_CATEGORIES = [
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
  "rejection",
  "newsletter",
  "spam",
  "personal",
  "other",
] as const;

const EMPTY_DRAFT: Pick<EmailUserRule, "name" | "conditions" | "actionCategory" | "actionScore" | "isEnabled" | "priority"> = {
  name: "",
  conditions: [{ field: "from_domain", op: "contains", value: "" }],
  actionCategory: "job_opportunity",
  actionScore: 1,
  isEnabled: true,
  priority: 50,
};

export function EmailRulesPanel() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<EmailUserRule[]>([]);
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    emailIntegrationService.listRules().then(setRules).catch(() => setRules([]));
  }, [isAuthenticated]);

  const handleAdd = async () => {
    if (!draft.name.trim() || draft.conditions.length === 0 || !draft.conditions[0].value.trim()) {
      toast({
        title: "Rule incomplete",
        description: "Name and at least one condition are required.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const created = await emailIntegrationService.createRule(draft);
      setRules((prev) => [...prev, created]);
      setDraft(EMPTY_DRAFT);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    await emailIntegrationService.deleteRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    await emailIntegrationService.patchRule(id, { isEnabled });
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isEnabled } : r)));
  };

  if (!isAuthenticated) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classification Rules</CardTitle>
        <CardDescription>
          User rules run before the AI classifier. Add rules to mark obvious senders or override the
          default categorisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 ? (
          <div className="text-sm text-muted-foreground">No custom rules yet.</div>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border rounded p-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  → {r.actionCategory} (score {Number(r.actionScore).toFixed(2)}, priority {r.priority})
                </div>
              </div>
              <Switch checked={r.isEnabled} onCheckedChange={(v) => handleToggle(r.id, v)} />
              <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}

        <Separator />

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide">Add rule</Label>
          <Input
            placeholder="Rule name (e.g. Mark recruiter@acme.com as recruiter outreach)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Select
              value={draft.conditions[0].field}
              onValueChange={(v) =>
                setDraft({ ...draft, conditions: [{ ...draft.conditions[0], field: v as any }] })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={draft.conditions[0].op}
              onValueChange={(v) =>
                setDraft({ ...draft, conditions: [{ ...draft.conditions[0], op: v as any }] })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="value"
              value={draft.conditions[0].value}
              onChange={(e) =>
                setDraft({ ...draft, conditions: [{ ...draft.conditions[0], value: e.target.value }] })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={draft.actionCategory}
              onValueChange={(v) => setDraft({ ...draft, actionCategory: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={busy}>
              <Plus className="h-4 w-4 mr-1" /> Add rule
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EmailRulesPanel;
