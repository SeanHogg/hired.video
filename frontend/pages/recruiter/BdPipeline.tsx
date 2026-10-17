/**
 * #99 / #222 / #223 — BD Pipeline Kanban. Stages along the X axis,
 * deals stacked per stage. Drag a deal card across stages to fire
 * `PATCH /api/recruiter-bd/deals/:id/stage`. The bottom strip surfaces
 * the rollup from `/api/recruiter-bd/rollup` so the recruiter sees
 * total + weighted pipeline value live.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";

interface Stage {
  id: string;
  stageKey: string;
  stageLabel: string;
  ordinal: number;
  winProbabilityBps: number | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

interface Deal {
  id: string;
  name: string;
  stageKey: string;
  estFeeCents: number | null;
  winProbabilityBps: number | null;
  expectedCloseDate: string | null;
  clientId: string | null;
}

interface Rollup {
  stages: Array<{ stageKey: string; count: number; totalCents: number; weightedCents: number }>;
  totalValueCents: number;
  weightedValueCents: number;
}

export default function BdPipeline() {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesBody, dealsBody, rollupBody] = await Promise.all([
        apiClient.fetchData<{ items?: Stage[] }>("/api/recruiter-bd/stages"),
        apiClient.fetchData<{ items?: Deal[] }>("/api/recruiter-bd/deals"),
        apiClient.fetchData<Rollup>("/api/recruiter-bd/rollup"),
      ]);
      setStages(stagesBody?.items ?? []);
      setDeals(dealsBody?.items ?? []);
      setRollup(rollupBody);
    } catch {
      toast.error("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const moveDeal = async (dealId: string, toStageKey: string) => {
    try {
      await apiClient.patch(`/api/recruiter-bd/deals/${encodeURIComponent(dealId)}/stage`, {
        stageKey: toStageKey,
      });
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stageKey: toStageKey } : d)));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    }
  };

  if (loading || !stages) {
    return (
      <AppShell>
        <div className="p-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-4 md:p-6 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">BD Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Client opportunities by stage. Drag cards to move stages — close-won + close-lost stages auto-stamp the deal.
            </p>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> New deal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <NewDealForm
                onCreated={() => {
                  setNewOpen(false);
                  void refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        </header>

        {rollup && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center gap-6">
            <span><strong>Total pipeline:</strong> ${(rollup.totalValueCents / 100).toLocaleString()}</span>
            <span><strong>Weighted:</strong> ${(rollup.weightedValueCents / 100).toLocaleString()}</span>
          </div>
        )}

        <div className="grid grid-flow-col auto-cols-[minmax(240px,1fr)] gap-3 overflow-x-auto">
          {stages.map((stage) => {
            const stageDeals = deals.filter((d) => d.stageKey === stage.stageKey);
            return (
              <div
                key={stage.id}
                className="rounded-md border bg-card flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dealId = e.dataTransfer.getData("application/x-deal-id");
                  if (dealId) void moveDeal(dealId, stage.stageKey);
                }}
              >
                <header className="p-2 border-b">
                  <div className="font-medium text-sm">{stage.stageLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {stageDeals.length} · {stage.winProbabilityBps != null ? `${(stage.winProbabilityBps / 100).toFixed(0)}%` : ""}
                  </div>
                </header>
                <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                  {stageDeals.map((d) => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-deal-id", d.id)}
                      className="rounded border bg-background p-2 text-sm cursor-grab active:cursor-grabbing"
                    >
                      <div className="font-medium truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {d.estFeeCents != null ? `$${(d.estFeeCents / 100).toLocaleString()}` : "no fee"}
                        {d.winProbabilityBps != null ? ` · ${(d.winProbabilityBps / 100).toFixed(0)}%` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function NewDealForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [estFee, setEstFee] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Deal name is required");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/api/recruiter-bd/deals", {
        name: name.trim(),
        estFeeCents: estFee ? Math.round(Number(estFee) * 100) : undefined,
      });
      toast.success("Deal created");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create deal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>New deal</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Estimated fee (USD)</label>
          <Input type="number" value={estFee} onChange={(e) => setEstFee(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
        </Button>
      </DialogFooter>
    </>
  );
}
