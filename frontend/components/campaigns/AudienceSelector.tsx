/**
 * AudienceSelector — reusable recipient-targeting control for the campaign
 * composer. Covers all three audience kinds (platform users by role / marketing
 * leads / explicit list) and shows a live "≈ N recipients" preview by calling
 * the dry-run resolve endpoint. Emits the shared CampaignAudience union so the
 * backend resolves exactly what the preview counted.
 */
import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { campaignService } from "@/lib/services/campaign-service";
import {
  AUDIENCE_KIND_LABELS,
  type CampaignAudience,
  type CampaignAudienceRole,
} from "@shared/campaigns";
import type { MarketingCategory } from "@shared/email-consent";
import { USER_ROLES } from "@shared/user-roles";

const KINDS: CampaignAudience["kind"][] = ["role", "leads", "list"];

const ROLE_OPTIONS: { value: CampaignAudienceRole; label: string }[] = [
  { value: USER_ROLES.JOB_SEEKER, label: "Job Seekers" },
  { value: USER_ROLES.RECRUITER, label: "Recruiters" },
  { value: USER_ROLES.EMPLOYER, label: "Employers" },
  { value: USER_ROLES.EMPLOYEE, label: "Employees" },
];

export interface AudienceSelectorProps {
  value: CampaignAudience | null;
  onChange: (audience: CampaignAudience) => void;
  /** Campaign category — the count reflects opt-outs for this category. */
  category?: MarketingCategory;
}

export function AudienceSelector({ value, onChange, category }: AudienceSelectorProps) {
  const kind = value?.kind ?? "role";
  const [preview, setPreview] = useState<{ count: number; loading: boolean }>({
    count: 0,
    loading: false,
  });

  // Debounced dry-run resolve whenever the audience changes.
  useEffect(() => {
    if (!value) return;
    let active = true;
    setPreview((p) => ({ ...p, loading: true }));
    const t = setTimeout(() => {
      campaignService
        .previewAudience(value, category)
        .then((res) => active && setPreview({ count: res.count, loading: false }))
        .catch(() => active && setPreview({ count: 0, loading: false }));
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [value, category]);

  const setKind = (k: CampaignAudience["kind"]) => {
    if (k === "role") onChange({ kind: "role", roles: [USER_ROLES.JOB_SEEKER], includeInactive: false });
    else if (k === "leads") onChange({ kind: "leads" });
    else onChange({ kind: "list", recipients: [] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? "default" : "outline"}
            onClick={() => setKind(k)}
          >
            {AUDIENCE_KIND_LABELS[k]}
          </Button>
        ))}
      </div>

      {value?.kind === "role" && (
        <div className="space-y-2">
          <Label>Target roles</Label>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((r) => {
              const selected = value.roles.includes(r.value);
              return (
                <Button
                  key={r.value}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => {
                    const roles = selected
                      ? value.roles.filter((x) => x !== r.value)
                      : [...value.roles, r.value];
                    onChange({ ...value, roles: roles.length ? roles : [r.value] });
                  }}
                >
                  {r.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {value?.kind === "leads" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="aud-source">Source prefix (optional)</Label>
            <Input
              id="aud-source"
              placeholder="e.g. contact_panel"
              value={value.sourcePrefix ?? ""}
              onChange={(e) =>
                onChange({ ...value, sourcePrefix: e.target.value || undefined })
              }
            />
          </div>
          <div>
            <Label htmlFor="aud-status">Status (optional)</Label>
            <Input
              id="aud-status"
              placeholder="e.g. new"
              value={value.status ?? ""}
              onChange={(e) => onChange({ ...value, status: e.target.value || undefined })}
            />
          </div>
        </div>
      )}

      {value?.kind === "list" && (
        <div>
          <Label htmlFor="aud-list">Email addresses</Label>
          <Textarea
            id="aud-list"
            rows={5}
            placeholder="One email per line — name optional: jane@acme.com, Jane Doe"
            value={value.recipients.map((r) => (r.name ? `${r.email}, ${r.name}` : r.email)).join("\n")}
            onChange={(e) => onChange({ kind: "list", recipients: parseList(e.target.value) })}
          />
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        {preview.loading ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting recipients…
          </span>
        ) : (
          <span>
            ≈ <strong className="text-foreground">{preview.count.toLocaleString()}</strong> recipient
            {preview.count === 1 ? "" : "s"} (after de-dup + unsubscribes)
          </span>
        )}
      </div>
    </div>
  );
}

/** Parse a textarea of "email" / "email, name" lines into the list shape. */
function parseList(raw: string): { email: string; name?: string }[] {
  const out: { email: string; name?: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [email, ...rest] = trimmed.split(",");
    const e = email.trim();
    if (!e.includes("@")) continue;
    out.push({ email: e, name: rest.join(",").trim() || undefined });
  }
  return out;
}

export default AudienceSelector;
