"use client";

/**
 * VideoFormsDialog — gap #140 frontend.
 *
 * Lets the project owner create / edit / delete in-video lead capture forms.
 * Each form is pinned to a playback timestamp and supports configurable
 * fields (email/text/tel/select). Submissions are listed inline.
 */

import { useEffect, useState } from "react";
import { Loader2, FormInput, Plus, Trash2, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  listVideoForms,
  createVideoForm,
  deleteVideoForm,
  getVideoFormSubmissions,
  type VideoForm,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
}

export default function VideoFormsDialog({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<VideoForm[]>([]);
  const [loading, setLoading] = useState(false);

  // New-form draft
  const [draftTitle, setDraftTitle] = useState("Get a free demo");
  const [draftPosition, setDraftPosition] = useState(5);
  const [draftRequireEmail, setDraftRequireEmail] = useState(true);
  const [draftRequireName, setDraftRequireName] = useState(true);
  const [draftGate, setDraftGate] = useState(true);
  const [draftRedirect, setDraftRedirect] = useState("");
  const [creating, setCreating] = useState(false);

  // Submission viewer
  const [openSubmissionsFor, setOpenSubmissionsFor] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Awaited<ReturnType<typeof getVideoFormSubmissions>> | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    listVideoForms(projectId).then(setForms).catch(() => setForms([])).finally(() => setLoading(false));
  }, [open, projectId]);

  async function handleCreate() {
    if (!projectId) return;
    setCreating(true);
    try {
      const fields = [
        ...(draftRequireName ? [{ key: "name", label: "Your name", type: "text" as const, required: true }] : []),
        ...(draftRequireEmail ? [{ key: "email", label: "Email", type: "email" as const, required: true }] : []),
      ];
      const created = await createVideoForm(projectId, {
        title: draftTitle,
        description: null,
        positionSeconds: draftPosition,
        fields,
        requireToContinue: draftGate,
        redirectUrl: draftRedirect || null,
        submitButtonText: "Continue",
      });
      setForms((f) => [...f, created]);
      setDraftTitle("Get a free demo");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteVideoForm(id);
    setForms((f) => f.filter((x) => x.id !== id));
    if (openSubmissionsFor === id) setOpenSubmissionsFor(null);
  }

  async function handleViewSubmissions(id: string) {
    if (openSubmissionsFor === id) {
      setOpenSubmissionsFor(null);
      setSubmissions(null);
      return;
    }
    setOpenSubmissionsFor(id);
    setSubmissions(null);
    const data = await getVideoFormSubmissions(id);
    setSubmissions(data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId} title="In-video lead forms">
          <FormInput className="w-3.5 h-3.5 mr-1" /> Forms
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>In-video Lead Forms</DialogTitle>
          <DialogDescription>
            Capture leads at any timestamp. Submissions sync into your global lead inbox.
          </DialogDescription>
        </DialogHeader>

        {/* Existing forms */}
        <div>
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Active forms</Label>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : forms.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No forms yet — create one below.</p>
          ) : (
            <ul className="flex flex-col gap-1 mt-1">
              {forms.map((f) => (
                <li key={f.id} className="border rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{f.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        @ {f.positionSeconds.toFixed(1)}s · {f.fields.length} fields · {f.requireToContinue ? "gated" : "skippable"}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleViewSubmissions(f.id)} title="Submissions">
                      <Inbox className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDelete(f.id)} title="Delete">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {openSubmissionsFor === f.id && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      {submissions === null ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      ) : submissions.total === 0 ? (
                        <p className="text-[10px] text-muted-foreground">No submissions yet.</p>
                      ) : (
                        <ul className="text-[10px] space-y-1 max-h-[120px] overflow-y-auto">
                          {submissions.submissions.map((s) => (
                            <li key={s.id} className="font-mono">
                              {s.viewerEmail ?? "(anon)"} · {new Date(s.createdAt).toLocaleString()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New form */}
        <div className="border-t pt-3">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">New form</Label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Form title"
              className="h-8 text-xs col-span-2"
            />
            <Input
              type="number"
              min={0}
              step={0.5}
              value={draftPosition}
              onChange={(e) => setDraftPosition(parseFloat(e.target.value) || 0)}
              placeholder="Position (s)"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <label className="flex items-center gap-1.5">
              <Switch checked={draftRequireName} onCheckedChange={setDraftRequireName} /> Name
            </label>
            <label className="flex items-center gap-1.5">
              <Switch checked={draftRequireEmail} onCheckedChange={setDraftRequireEmail} /> Email
            </label>
            <label className="flex items-center gap-1.5">
              <Switch checked={draftGate} onCheckedChange={setDraftGate} /> Gate playback
            </label>
          </div>
          <Input
            value={draftRedirect}
            onChange={(e) => setDraftRedirect(e.target.value)}
            placeholder="Redirect URL (optional)"
            className="h-8 text-xs mt-2"
          />
          <Button size="sm" className="h-7 text-xs mt-2 w-full" onClick={handleCreate} disabled={creating || !draftTitle}>
            {creating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
            Create form
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
