// BulkAddToListDialog — pick (or create) a list, then add the selected
// pipeline entries to it in one shot. Replaces the "Coming soon" toast on
// the kanban toolbar's "Add to…" button.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, ListPlus, Loader2, Lock, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  listsService,
  type ListCompany,
  type ListWithMeta,
} from "@/lib/services/lists-service";

interface BulkAddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pipeline-entry IDs to bulk-add. */
  entryIds: string[];
}

export default function BulkAddToListDialog({
  open,
  onOpenChange,
  entryIds,
}: BulkAddToListDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [lists, setLists] = useState<ListWithMeta[]>([]);
  const [companies, setCompanies] = useState<ListCompany[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Inline-create state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIsPrivate, setNewIsPrivate] = useState(true);
  const [newCompanyId, setNewCompanyId] = useState<string | "personal">("personal");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listsService
      .list("pipeline_entry")
      .then((res) => {
        if (cancelled) return;
        setLists(res.lists);
        setCompanies(res.companies);
        // Default to first writable list, or empty (forces user to create).
        const firstWritable = res.lists.find((l) => l.canMutate);
        setSelectedListId(firstWritable?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          toast({ title: t("errors.failedToLoadLists"), variant: "destructive" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, toast, t]);

  async function addAllToSelected(listId: string) {
    setBusy(true);
    let added = 0;
    let failed = 0;
    for (const entryId of entryIds) {
      try {
        await listsService.addItem(listId, "pipeline_entry", entryId);
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (failed === 0) {
      toast({ title: t("messages.addedToList", { count: added }) });
    } else if (added === 0) {
      toast({
        title: t("errors.failedToAdd"),
        description: t("errors.failedToAddDesc", { count: failed }),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("messages.addedSomeFailed", { added, failed }),
        description: t("messages.addedSomeFailedDesc"),
      });
    }
    onOpenChange(false);
  }

  async function handleCreateAndAdd() {
    if (!newTitle.trim()) {
      toast({ title: t("errors.titleRequired"), variant: "destructive" });
      return;
    }
    try {
      setBusy(true);
      const companyId = newCompanyId === "personal" ? null : newCompanyId;
      const created = await listsService.create({
        title: newTitle.trim(),
        isPrivate: companyId ? newIsPrivate : true,
        companyId,
      });
      setCreateOpen(false);
      setNewTitle("");
      await addAllToSelected(created.id);
    } catch (e) {
      setBusy(false);
      toast({
        title: t("errors.createListFailed"),
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-primary" />
            {t("labels.addCandidatesToList", { count: entryIds.length })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.bulkAddListDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("status.loadingLists")}
            </div>
          ) : lists.length === 0 ? (
            <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t("messages.noListsYetCreate")}
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="bulk-list-pick">{t("fields.bulkListPick.label")}</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger id="bulk-list-pick">
                  <SelectValue placeholder={t("labels.pickList")} />
                </SelectTrigger>
                <SelectContent>
                  {lists
                    .filter((l) => l.canMutate)
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <span className="inline-flex items-center gap-1.5">
                          {l.companyId ? (
                            l.isPrivate ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Users className="w-3 h-3" />
                            )
                          ) : (
                            <Lock className="w-3 h-3" />
                          )}
                          {l.title}
                          <span className="text-muted-foreground">({l.itemCount})</span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t("actions.createList")}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={() => addAllToSelected(selectedListId)}
            disabled={busy || !selectedListId || entryIds.length === 0}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("status.adding")}
              </>
            ) : (
              t("actions.addToList")
            )}
          </Button>
        </DialogFooter>

        {/* Inline-create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("actions.createListAndAdd")}</DialogTitle>
              <DialogDescription>
                {t("messages.createListAndAddDesc", { count: entryIds.length })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="bulk-new-title">{t("fields.listTitle.label")}</Label>
                <Input
                  id="bulk-new-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t("fields.listTitle.placeholder")}
                  autoFocus
                />
              </div>
              {companies.length > 0 && (
                <>
                  <div className="space-y-1">
                    <Label>{t("fields.visibility.label")}</Label>
                    <Select
                      value={newCompanyId}
                      onValueChange={(v) => setNewCompanyId(v as string | "personal")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal">
                          <span className="inline-flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            {t("labels.personalOnlyYou")}
                          </span>
                        </SelectItem>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5" />
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newCompanyId !== "personal" && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="bulk-new-private"
                        checked={newIsPrivate}
                        onCheckedChange={(v) => setNewIsPrivate(v === true)}
                      />
                      <Label htmlFor="bulk-new-private" className="cursor-pointer text-sm font-normal">
                        {t("labels.privateOnlyMe")}
                      </Label>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={handleCreateAndAdd} disabled={busy || !newTitle.trim()}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {t("actions.createListAddCount", { count: entryIds.length })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
