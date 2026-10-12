// ListsButton — header control for the polymorphic Lists feature. Sits next
// to the List/Card view toggle on People / Jobs / Resumes / Companies.
//
// Click → popover with: search box, list rows (radio-style selection),
// "+ Create list", and a pencil-edit affordance per row. Selecting a list
// sets `?list_id=<id>` on the URL; the parent page filters its results to
// items in that list. Clearing returns "All".
//
// Lists are user-owned. The popover shows lists visible to the caller —
// their personal lists + team-shared lists from any of their companies.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  Check,
  Loader2,
  ListFilter,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { confirmDialog } from "@/lib/dialogs";
import { Badge } from "@/components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  type ListEntityType,
  type ListWithMeta,
} from "@/lib/services/lists-service";

interface ListsButtonProps {
  /** Which entity type's lists to show (drives item-count annotation). */
  entityType: ListEntityType;
  /** URL search-param key to use. Defaults to "list_id" (matches Loxo). */
  paramKey?: string;
  /** Optional CSS class for the trigger button. */
  className?: string;
}

export default function ListsButton({
  entityType,
  paramKey = "list_id",
  className,
}: ListsButtonProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const selectedListId = searchParams.get(paramKey);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lists, setLists] = useState<ListWithMeta[]>([]);
  const [companies, setCompanies] = useState<ListCompany[]>([]);
  const [filter, setFilter] = useState("");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIsPrivate, setNewIsPrivate] = useState(true);
  const [newCompanyId, setNewCompanyId] = useState<string | "personal">("personal");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editingList, setEditingList] = useState<ListWithMeta | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIsPrivate, setEditIsPrivate] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load lists when popover opens. Cheap to refetch each open — keeps
  // counts/membership fresh after team-mates add items elsewhere.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listsService
      .list(entityType)
      .then((res) => {
        if (cancelled) return;
        setLists(res.lists);
        setCompanies(res.companies);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: "Failed to load lists", variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entityType, toast]);

  const filteredLists = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((l) => l.title.toLowerCase().includes(q));
  }, [lists, filter]);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId],
  );

  // ─── Selection ──────────────────────────────────────────────────────────

  function setListFilter(listId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (listId) next.set(paramKey, listId);
    else next.delete(paramKey);
    setSearchParams(next, { replace: true });
  }

  // ─── Create ─────────────────────────────────────────────────────────────

  function openCreate() {
    setNewTitle("");
    // Default to a team list (private off) only when at least one company exists.
    setNewIsPrivate(companies.length === 0 ? true : false);
    setNewCompanyId(companies.length > 0 ? companies[0].id : "personal");
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    try {
      setCreating(true);
      const companyId = newCompanyId === "personal" ? null : newCompanyId;
      const created = await listsService.create({
        title: newTitle.trim(),
        isPrivate: companyId ? newIsPrivate : true,
        companyId,
      });
      // Optimistic insert with itemCount=0; canMutate is true since user is owner.
      const withMeta: ListWithMeta = { ...created, itemCount: 0, canMutate: true };
      setLists((prev) => [withMeta, ...prev]);
      setCreateOpen(false);
      // Auto-select the new list — matches the Loxo flow.
      setListFilter(created.id);
      setOpen(false);
      toast({ title: "List created" });
    } catch (e) {
      toast({
        title: "Failed to create list",
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  // ─── Edit / delete ──────────────────────────────────────────────────────

  function openEdit(list: ListWithMeta) {
    setEditingList(list);
    setEditTitle(list.title);
    setEditIsPrivate(list.isPrivate);
  }

  async function handleSaveEdit() {
    if (!editingList) return;
    if (!editTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    try {
      setSavingEdit(true);
      const updated = await listsService.update(editingList.id, {
        title: editTitle.trim(),
        isPrivate: editingList.companyId ? editIsPrivate : true,
      });
      setLists((prev) =>
        prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
      );
      setEditingList(null);
      toast({ title: "List updated" });
    } catch (e) {
      toast({
        title: "Failed to update list",
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!editingList) return;
    if (!(await confirmDialog({ title: t("dialogs.lists.deleteListTitle"), description: t("dialogs.lists.deleteListDescription", { title: editingList.title }), confirmText: t("dialogs.lists.deleteConfirm"), destructive: true }))) {
      return;
    }
    try {
      setDeleting(true);
      await listsService.delete(editingList.id);
      setLists((prev) => prev.filter((l) => l.id !== editingList.id));
      // If the deleted list was selected, clear the URL filter.
      if (selectedListId === editingList.id) setListFilter(null);
      setEditingList(null);
      toast({ title: "List deleted" });
    } catch (e) {
      toast({
        title: "Failed to delete list",
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const triggerLabel = selectedList ? selectedList.title : "Lists";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={selectedList ? "default" : "outline"}
            size="sm"
            className={className}
          >
            <ListFilter className="h-4 w-4 mr-1.5" />
            <span className="truncate max-w-[180px]">{triggerLabel}</span>
            {selectedList && (
              <X
                className="h-3.5 w-3.5 ml-1.5 opacity-70 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setListFilter(null);
                }}
              />
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search lists"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLists.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {lists.length === 0
                  ? "No lists yet."
                  : "No lists match your search."}
              </div>
            ) : (
              filteredLists.map((list) => {
                const active = list.id === selectedListId;
                return (
                  <div
                    key={list.id}
                    className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/40 ${
                      active ? "bg-muted/30" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setListFilter(active ? null : list.id);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <div
                        className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${
                          active ? "border-primary bg-primary" : "border-muted-foreground"
                        }`}
                      >
                        {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{list.title}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {list.companyId ? (
                            list.isPrivate ? (
                              <>
                                <Lock className="h-2.5 w-2.5" />
                                Private
                              </>
                            ) : (
                              <>
                                <Users className="h-2.5 w-2.5" />
                                Team
                              </>
                            )
                          ) : (
                            <>
                              <Lock className="h-2.5 w-2.5" />
                              Personal
                            </>
                          )}
                          <span>·</span>
                          <span>{list.itemCount}</span>
                        </div>
                      </div>
                    </button>
                    {list.canMutate && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => openEdit(list)}
                        title="Edit list"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t p-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create list
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* ─── Create dialog ────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create list</DialogTitle>
            <DialogDescription>
              Group {entityType === "person" ? "people" : `${entityType}s`} for quick access. Lists
              filter the page to just the items you've added.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q2 hiring shortlist"
                autoFocus
              />
            </div>
            {companies.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label>Visibility</Label>
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
                          <Lock className="h-3.5 w-3.5" />
                          Personal (only you)
                        </span>
                      </SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
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
                      id="newIsPrivate"
                      checked={newIsPrivate}
                      onCheckedChange={(v) => setNewIsPrivate(v === true)}
                    />
                    <Label htmlFor="newIsPrivate" className="cursor-pointer text-sm font-normal">
                      Private — only me (uncheck to share with the team)
                    </Label>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={editingList !== null}
        onOpenChange={(o) => {
          if (!o) setEditingList(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit list{editingList ? `: ${editingList.title}` : ""}</DialogTitle>
            {editingList && (
              <DialogDescription>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {editingList.companyId ? (
                    <Badge variant="outline" className="text-[10px]">
                      <Building2 className="h-2.5 w-2.5 mr-1" />
                      Team list
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      <Lock className="h-2.5 w-2.5 mr-1" />
                      Personal
                    </Badge>
                  )}
                  · {editingList.itemCount} {entityType === "person" ? "people" : `${entityType}s`}
                </span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
              />
            </div>
            {editingList?.companyId && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="editIsPrivate"
                  checked={editIsPrivate}
                  onCheckedChange={(v) => setEditIsPrivate(v === true)}
                />
                <Label htmlFor="editIsPrivate" className="cursor-pointer text-sm font-normal">
                  Private — only me
                </Label>
              </div>
            )}
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={savingEdit || deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingList(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit || !editTitle.trim()}>
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
