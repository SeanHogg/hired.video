/**
 * ScreeningResultsPanel — recruiter-facing review of RETURNED screenings (#1852).
 *
 * The send half of the loop already existed (author a template → send a request),
 * but nothing surfaced what came back. This reads the existing recruiter
 * endpoints (`GET /requests`, `GET /requests/:id`) and renders each sent
 * request's status + the per-item result pointers (the assembled "pitch book"):
 * which items the candidate satisfied, how (pre-existing vs completed now), and
 * a compact view of the result_ref artifact pointer.
 *
 * Self-contained + self-gating: renders nothing without a company, so the caller
 * mounts it unconditionally.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ClipboardList, CheckCircle2, Circle, MinusCircle } from "lucide-react";
import {
  screeningService,
  type ScreeningRequestRow,
  type ScreeningRequestWithItems,
} from "@/lib/services/screening-service";
import {
  getScreeningCatalogEntry,
  type ScreeningItemType,
  type ScreeningRequestStatus,
} from "@shared/screening";

const STATUS_VARIANT: Record<ScreeningRequestStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  in_progress: "secondary",
  completed: "default",
  expired: "destructive",
};

function ItemStatusIcon({ status }: { status: string }) {
  if (status === "satisfied") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "skipped") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export default function ScreeningResultsPanel({ companyId }: { companyId: string | null }) {
  const [requests, setRequests] = useState<ScreeningRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ScreeningRequestWithItems | null>(null);
  const [detailFor, setDetailFor] = useState<ScreeningRequestRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setRequests(await screeningService.listRequests(companyId));
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(req: ScreeningRequestRow) {
    setDetailFor(req);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await screeningService.getRequest(req.id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  if (!companyId) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5" /> No screenings sent yet
          </CardTitle>
          <CardDescription>
            Send a screening template to a candidate and their results will show up here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {requests.map((req) => (
          <Card key={req.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">
                    {req.candidateName || req.candidateEmail}
                  </CardTitle>
                  <CardDescription className="truncate">{req.candidateEmail}</CardDescription>
                </div>
                <Badge variant={STATUS_VARIANT[req.status]}>{req.status.replace("_", " ")}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" onClick={() => void openDetail(req)}>
                View results
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailFor?.candidateName || detailFor?.candidateEmail} — screening results
            </DialogTitle>
            <DialogDescription>
              {detailFor ? `Status: ${detailFor.status.replace("_", " ")}` : ""}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-muted-foreground py-4">Couldn't load results.</p>
          ) : (
            <ul className="space-y-2">
              {detail.items.map((it) => {
                const entry = getScreeningCatalogEntry(it.itemType as ScreeningItemType);
                const ref = it.resultRef
                  ? Object.entries(it.resultRef)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")
                  : null;
                return (
                  <li key={it.id} className="flex items-start gap-2 rounded-md border p-2.5">
                    <ItemStatusIcon status={it.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{entry.title}</span>
                        {it.isRequired && (
                          <Badge variant="outline" className="text-[10px]">required</Badge>
                        )}
                        {it.satisfiedSource && (
                          <Badge variant="secondary" className="text-[10px]">
                            {it.satisfiedSource === "pre_existing" ? "on file" : "completed"}
                          </Badge>
                        )}
                      </div>
                      {ref && <p className="text-xs text-muted-foreground truncate">{ref}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
