/**
 * #188 — SuperAdmin templates-review page. Renders the pending queue
 * from `/api/admin/templates-review` and exposes approve / reject
 * actions with a notes textarea. Both kinds (`studio`, `job`) surface
 * in the same list, badged by kind for fast triage.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";

interface PendingItem {
  kind: "studio" | "job";
  row: {
    id: string;
    title?: string | null;
    name?: string | null;
    ownerUserId?: string | null;
    listingStatus?: string;
    createdAt?: string;
  };
}

export default function TemplatesReview() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const body = await apiClient.fetchData<{ items?: PendingItem[] }>("/api/admin/templates-review");
      setItems(body?.items ?? []);
    } catch (err) {
      toast.error("Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = async (item: PendingItem, decision: "approve" | "reject") => {
    setBusyId(item.row.id);
    try {
      await apiClient.post(
        `/api/admin/templates-review/${item.kind}/${item.row.id}/${decision}`,
        { notes: notesById[item.row.id]?.trim() || undefined },
      );
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      setItems((prev) => prev.filter((p) => p.row.id !== item.row.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record decision");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-4 md:p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Templates review queue</h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject user-submitted resume + job templates.
          </p>
        </header>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No templates pending review.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.row.id} className="rounded-md border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{item.row.title ?? item.row.name ?? "Untitled"}</h3>
                      <Badge variant="outline" className="capitalize">{item.kind}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      ID: {item.row.id}
                      {item.row.createdAt ? ` · submitted ${new Date(item.row.createdAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
                <Textarea
                  placeholder="Notes (sent to author on rejection; stored as audit trail on approval)"
                  rows={2}
                  value={notesById[item.row.id] ?? ""}
                  onChange={(e) => setNotesById((p) => ({ ...p, [item.row.id]: e.target.value }))}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === item.row.id}
                    onClick={() => decide(item, "reject")}
                  >
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === item.row.id}
                    onClick={() => decide(item, "approve")}
                  >
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
