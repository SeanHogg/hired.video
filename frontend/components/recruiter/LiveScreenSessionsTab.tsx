/**
 * #1209 — Recruiter dashboard "Live Screening" tab. Lists the
 * recruiter's screening sessions and lets them create new ones. Self-
 * gated: nothing renders for users without the recruiter role
 * (consumer of `useRoleAccess`), so the parent dashboard can mount
 * this unconditionally and let the component decide its own
 * visibility per the DRY rule.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";

interface LiveScreenSession {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  inviteCount: number;
  acceptedCount: number;
  status: "draft" | "scheduled" | "in_progress" | "completed" | "cancelled";
}

export default function LiveScreenSessionsTab() {
  const [sessions, setSessions] = useState<LiveScreenSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/live-screen/sessions");
      const body = (res as any).data?.data ?? (res as any).data ?? {};
      setSessions((body.items ?? []) as LiveScreenSession[]);
    } catch (err) {
      toast.error("Failed to load live-screen sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live screening sessions</h2>
          <p className="text-sm text-muted-foreground">
            Schedule back-to-back interview slots and send candidate magic-link invites.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New session
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          <Video className="h-8 w-8 mx-auto mb-2 opacity-60" />
          No screening sessions yet. Create one to start scheduling candidate slots.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-md border bg-card p-3 flex justify-between items-center">
              <div>
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {s.acceptedCount}/{s.inviteCount} accepted · {s.durationMinutes}min slots
                </div>
              </div>
              <div className="text-xs uppercase text-muted-foreground">{s.status}</div>
            </div>
          ))}
        </div>
      )}

      <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} />
    </div>
  );
}

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

function CreateSessionDialog({ open, onClose, onCreated }: CreateSessionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/api/live-screen/sessions", {
        title: title.trim(),
        description: description.trim() || undefined,
        durationMinutes,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      toast.success("Session created");
      onClose();
      setTitle("");
      setDescription("");
      setDurationMinutes(30);
      setScheduledAt("");
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New live-screen session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor="description" className="text-sm font-medium">Description (optional)</label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="duration" className="text-sm font-medium">Slot duration (min)</label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 30)}
              />
            </div>
            <div>
              <label htmlFor="scheduledAt" className="text-sm font-medium">Starts</label>
              <Input id="scheduledAt" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
