/**
 * CampaignComposerDialog — the reusable compose/edit-campaign form. Combines
 * the template picker, inline body, audience selector and scheduling into one
 * dialog. Surface-agnostic: the parent owns persistence via `onSubmit`, so the
 * same dialog serves the SuperAdmin manager today and any future user-facing
 * campaign composer.
 */
import { useEffect, useState } from "react";
import { Loader2, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CampaignAudience,
  CampaignDTO,
  CampaignTemplateDTO,
  CreateCampaignInput,
} from "@shared/campaigns";
import { AudienceSelector } from "./AudienceSelector";
import { TemplatePicker } from "./TemplatePicker";

export type ComposerAction = "draft" | "send";

export interface CampaignComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: CampaignTemplateDTO[];
  /** Edit an existing campaign; omit to compose a new one. */
  initial?: CampaignDTO | null;
  /** Persist. `action` = "send" ⇒ parent should also schedule after create. */
  onSubmit: (
    input: CreateCampaignInput & { scheduledAt: string | null },
    action: ComposerAction,
  ) => Promise<void>;
}

export function CampaignComposerDialog({
  open,
  onOpenChange,
  templates,
  initial,
  onSubmit,
}: CampaignComposerDialogProps) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [htmlBody, setHtmlBody] = useState("");
  const [audience, setAudience] = useState<CampaignAudience | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<ComposerAction | null>(null);

  // Re-seed the form whenever the dialog opens (new vs edit).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSubject(initial?.subject ?? "");
    setFromName(initial?.fromName ?? "");
    setDescription(initial?.description ?? "");
    setTemplateId(initial?.templateId ?? null);
    setHtmlBody("");
    setAudience(initial?.audience ?? null);
    setScheduledAt(
      initial?.scheduledAt ? toLocalInput(initial.scheduledAt) : "",
    );
  }, [open, initial]);

  const valid =
    name.trim().length > 0 &&
    subject.trim().length > 0 &&
    (templateId !== null || htmlBody.trim().length > 0);

  const submit = async (action: ComposerAction) => {
    if (!valid) return;
    setBusy(action);
    try {
      await onSubmit(
        {
          name: name.trim(),
          subject: subject.trim(),
          description: description.trim() || undefined,
          templateId,
          htmlBody: templateId ? undefined : htmlBody,
          fromName: fromName.trim() || undefined,
          audience: audience ?? undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
        action,
      );
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>
            Compose a marketing email, choose who receives it, and schedule the
            send. Sent as the hired.video company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-name">Campaign name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="c-from">From name</Label>
              <Input
                id="c-from"
                placeholder="hired.video"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="c-subject">Subject line</Label>
            <Input
              id="c-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Use {{name}} for personalization"
            />
          </div>

          <div>
            <Label htmlFor="c-desc">Internal description (optional)</Label>
            <Input id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} />

          {!templateId && (
            <div>
              <Label htmlFor="c-body">Email body (HTML)</Label>
              <Textarea
                id="c-body"
                rows={8}
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                placeholder="<h1>Hi {{name}}</h1><p>…</p>"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Wrapped in the hired.video layout with an unsubscribe footer
                automatically. Tokens: {"{{name}}"}, {"{{email}}"}.
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-sm font-semibold">Audience</Label>
            <AudienceSelector value={audience} onChange={setAudience} />
          </div>

          <div>
            <Label htmlFor="c-when">Schedule for (optional — empty = send now)</Label>
            <Input
              id="c-when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={!valid || busy !== null}
            onClick={() => submit("draft")}
          >
            {busy === "draft" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save draft
          </Button>
          <Button
            disabled={!valid || busy !== null || !audience}
            onClick={() => submit("send")}
          >
            {busy === "send" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            {scheduledAt ? "Schedule" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ISO → value for <input type="datetime-local"> (local tz, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default CampaignComposerDialog;
