// SuperAdmin — compose, schedule and send marketing email campaigns as the
// hired.video company. Reuses the shared campaign engine (CampaignService) and
// the reusable campaign components (composer, list, audience selector,
// template picker) so this surface and the user-facing Outreach campaigns stay
// in lockstep.
//
// Reads/writes /api/admin/campaigns. Sends run on the cron loop (audience →
// render → provider) with unsubscribe + open tracking handled by the engine.

import { useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Plus,
  Loader2,
  Pencil,
  Send,
  Pause,
  XCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CampaignComposerDialog,
  CampaignList,
  CampaignStatusBadge,
  type ComposerAction,
} from "@/components/campaigns";
import { campaignService } from "@/lib/services/campaign-service";
import {
  isSchedulable,
  type CampaignDTO,
  type CampaignTemplateDTO,
  type CreateCampaignInput,
} from "@shared/campaigns";

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignDTO | null>(null);
  const [templateEditing, setTemplateEditing] = useState<CampaignTemplateDTO | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        campaignService.adminList(),
        campaignService.adminListTemplates(),
      ]);
      setCampaigns(c);
      setTemplates(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleSubmit = async (
    input: CreateCampaignInput & { scheduledAt: string | null },
    action: ComposerAction,
  ) => {
    const campaign = editing
      ? await campaignService.adminUpdate(editing.id, input)
      : await campaignService.adminCreate(input);
    if (action === "send") {
      await campaignService.adminSchedule(campaign.id, input.scheduledAt ?? null);
    }
    setEditing(null);
    await refresh();
  };

  const rowAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (c: CampaignDTO) => {
    const busy = busyId === c.id;
    return (
      <div className="flex items-center gap-1">
        {isSchedulable(c.status) && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={busy}
              aria-label="Edit"
              onClick={() => {
                setEditing(c);
                setComposerOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary"
              disabled={busy || !c.audience}
              aria-label="Send now"
              onClick={() => rowAction(c.id, () => campaignService.adminSchedule(c.id, c.scheduledAt))}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </>
        )}
        {(c.status === "scheduled" || c.status === "sending") && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-orange-600"
            disabled={busy}
            aria-label="Pause"
            onClick={() => rowAction(c.id, () => campaignService.adminPause(c.id))}
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}
        {c.status !== "sent" && c.status !== "cancelled" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            disabled={busy}
            aria-label="Cancel"
            onClick={() => rowAction(c.id, () => campaignService.adminCancel(c.id))}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Email Campaigns
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Compose, schedule and send marketing emails to platform users,
            marketing leads, or an explicit list. Every send goes out as the
            hired.video company with unsubscribe handling built in.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setComposerOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New campaign
        </Button>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          {loading ? (
            <Loading />
          ) : (
            <CampaignList
              campaigns={campaigns}
              renderActions={renderActions}
              emptyState={
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    No campaigns yet. Click <strong>New campaign</strong> to send
                    your first marketing email.
                  </CardContent>
                </Card>
              }
            />
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setTemplateEditing(null);
                setTemplateDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New template
            </Button>
          </div>
          {loading ? (
            <Loading />
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No templates yet.
              </CardContent>
            </Card>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                </div>
                {!t.isActive && <CampaignStatusBadge status="paused" />}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label="Edit template"
                  onClick={() => {
                    setTemplateEditing(t);
                    setTemplateDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  aria-label="Delete template"
                  onClick={() =>
                    rowAction(t.id, () => campaignService.adminDeleteTemplate(t.id))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <CampaignComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        templates={templates}
        initial={editing}
        onSubmit={handleSubmit}
      />

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        initial={templateEditing}
        onSaved={refresh}
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading…
    </div>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: CampaignTemplateDTO | null;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSubject(initial?.subject ?? "");
    setHtmlBody(initial?.htmlBody ?? "");
    setIsActive(initial?.isActive ?? true);
  }, [open, initial]);

  const valid = name.trim() && subject.trim() && htmlBody.trim();

  const save = async () => {
    setBusy(true);
    try {
      const payload = { name: name.trim(), subject: subject.trim(), htmlBody, isActive };
      if (initial) await campaignService.adminUpdateTemplate(initial.id, payload);
      else await campaignService.adminCreateTemplate(payload);
      await onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            Reusable email body. Use {"{{name}}"} / {"{{email}}"} tokens for
            per-recipient personalization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-subject">Subject</Label>
            <Input id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-body">Body (HTML)</Label>
            <Textarea
              id="t-body"
              rows={10}
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-sm">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
