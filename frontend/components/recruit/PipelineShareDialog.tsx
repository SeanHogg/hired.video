// PipelineShareDialog — owner-side management of tokenised share links
// for the candidate kanban. Each link surfaces a read-only portal at
// /pipeline/portal/:token that hiring managers can browse without an account.

import { useEffect, useState } from "react";
import { Copy, Loader2, Plus, Share, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  jobPipelineService,
  type PipelineShareLink,
} from "@/lib/services/job-pipeline-service";

interface PipelineShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
}

export default function PipelineShareDialog({ open, onOpenChange, jobId }: PipelineShareDialogProps) {
  const { toast } = useToast();
  const [links, setLinks] = useState<PipelineShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    jobPipelineService
      .listShareLinks(jobId)
      .then((res) => {
        if (!cancelled) setLinks(res.links);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const link = await jobPipelineService.createShareLink(jobId, {
        label: label.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setLinks((prev) => [link, ...prev]);
      setLabel("");
      setExpiresAt("");
      toast({ title: "Share link created" });
    } catch (e) {
      toast({
        title: "Create failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/pipeline/portal/${token}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Share URL in your clipboard." });
  };

  const handleDelete = async (linkId: string) => {
    try {
      await jobPipelineService.deleteShareLink(jobId, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (e) {
      toast({
        title: "Revoke failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share className="w-4 h-4 text-primary" />
            Hiring manager portal links
          </DialogTitle>
          <DialogDescription>
            Generate a read-only URL for hiring managers to browse the candidate
            kanban without an account. Email + phone are redacted server-side;
            stage progression and tags are visible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border rounded p-3 bg-muted/30">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="share-label">Label (who is this for)</Label>
              <Input
                id="share-label"
                placeholder="Acme — exec hiring committee"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="share-expires">Expires (optional)</Label>
              <Input
                id="share-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" />
                    Create link
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Active links</h4>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </div>
            ) : links.length === 0 ? (
              <p className="text-xs text-muted-foreground">No share links yet.</p>
            ) : (
              <div className="space-y-2">
                {links.map((l) => (
                  <div key={l.id} className="border rounded p-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{l.label ?? "(unlabeled)"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        /pipeline/portal/{l.shareToken.slice(0, 12)}…
                        {l.expiresAt && ` · expires ${new Date(l.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleCopy(l.shareToken)}>
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(l.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
