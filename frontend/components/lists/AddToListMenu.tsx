// AddToListMenu — dropdown menu item for action panels. Shown alongside
// "Add to job", "Add to campaign", etc. on People / Jobs / Resumes /
// Companies rows.
//
// Renders as a `<DropdownMenuSub>` so the parent dropdown stays in
// control. On hover, the user sees their lists; clicking adds the
// entity. "+ Create list" pops a small inline dialog.

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  ListPlus,
  Loader2,
  Lock,
  Plus,
  Users,
} from "lucide-react";
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
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
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
  type ListEntityType,
  type ListWithMeta,
} from "@/lib/services/lists-service";

interface AddToListMenuProps {
  entityType: ListEntityType;
  entityId: string;
  /**
   * Optional name shown in the toast on success ("Added Alice to Q2 shortlist").
   * Falls back to the entityType label.
   */
  entityLabel?: string;
}

export default function AddToListMenu({
  entityType,
  entityId,
  entityLabel,
}: AddToListMenuProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lists, setLists] = useState<ListWithMeta[]>([]);
  const [companies, setCompanies] = useState<ListCompany[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [busyListId, setBusyListId] = useState<string | null>(null);

  // Create-inline dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIsPrivate, setNewIsPrivate] = useState(true);
  const [newCompanyId, setNewCompanyId] = useState<string | "personal">("personal");
  const [creating, setCreating] = useState(false);

  // Load lists on first hover. Cheap; cached for the dropdown lifetime.
  async function loadIfNeeded() {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const res = await listsService.list(entityType);
      setLists(res.lists);
      setCompanies(res.companies);
      setLoaded(true);

      // Prefill membership: which lists already contain this entity? Done
      // client-side by scanning each list's items. For typical sizes (lists
      // hold dozens, not thousands) this is fine; could move to a
      // dedicated /membership endpoint later.
      const checks = await Promise.all(
        res.lists.map((l) =>
          listsService
            .getItems(l.id, entityType)
            .then((r) => ({ id: l.id, has: r.items.some((i) => i.entityId === entityId) }))
            .catch(() => ({ id: l.id, has: false })),
        ),
      );
      setMemberOf(new Set(checks.filter((c) => c.has).map((c) => c.id)));
    } catch {
      toast({ title: "Failed to load lists", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleMembership(list: ListWithMeta) {
    const isMember = memberOf.has(list.id);
    try {
      setBusyListId(list.id);
      if (isMember) {
        await listsService.removeItem(list.id, entityType, entityId);
        setMemberOf((prev) => {
          const next = new Set(prev);
          next.delete(list.id);
          return next;
        });
        setLists((prev) =>
          prev.map((l) =>
            l.id === list.id ? { ...l, itemCount: Math.max(0, l.itemCount - 1) } : l,
          ),
        );
        toast({ title: `Removed from ${list.title}` });
      } else {
        const result = await listsService.addItem(list.id, entityType, entityId);
        setMemberOf((prev) => new Set(prev).add(list.id));
        if (!result.alreadyPresent) {
          setLists((prev) =>
            prev.map((l) =>
              l.id === list.id ? { ...l, itemCount: l.itemCount + 1 } : l,
            ),
          );
        }
        toast({
          title: `Added ${entityLabel ?? entityType} to ${list.title}`,
        });
      }
    } catch (e) {
      toast({
        title: "Failed to update list",
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setBusyListId(null);
    }
  }

  function openCreate() {
    setNewTitle("");
    setNewIsPrivate(companies.length === 0 ? true : false);
    setNewCompanyId(companies.length > 0 ? companies[0].id : "personal");
    setCreateOpen(true);
  }

  async function handleCreateAndAdd() {
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
      // Add the entity in the same flow.
      await listsService.addItem(created.id, entityType, entityId);
      setLists((prev) => [
        { ...created, itemCount: 1, canMutate: true },
        ...prev,
      ]);
      setMemberOf((prev) => new Set(prev).add(created.id));
      setCreateOpen(false);
      toast({ title: `Added to new list "${created.title}"` });
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

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger onMouseEnter={loadIfNeeded} onFocus={loadIfNeeded}>
          <ListPlus className="h-4 w-4 mr-2" />
          Add to a list
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="min-w-56 max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && loaded && lists.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No lists yet — create one below.
              </div>
            )}
            {!loading &&
              lists.map((list) => {
                const isMember = memberOf.has(list.id);
                const busy = busyListId === list.id;
                return (
                  <DropdownMenuItem
                    key={list.id}
                    onSelect={(e) => {
                      e.preventDefault(); // keep the menu open after click
                      toggleMembership(list);
                    }}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                        isMember ? "border-primary bg-primary" : "border-muted-foreground"
                      }`}
                    >
                      {isMember && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{list.title}</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {list.companyId ? (
                          list.isPrivate ? (
                            <>
                              <Lock className="h-2.5 w-2.5" /> Private
                            </>
                          ) : (
                            <>
                              <Users className="h-2.5 w-2.5" /> Team
                            </>
                          )
                        ) : (
                          <>
                            <Lock className="h-2.5 w-2.5" /> Personal
                          </>
                        )}
                      </div>
                    </div>
                    {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </DropdownMenuItem>
                );
              })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                openCreate();
              }}
              className="text-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create list…
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>

      {/* Inline create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create list and add</DialogTitle>
            <DialogDescription>
              Creates a new list and immediately adds {entityLabel ?? `this ${entityType}`} to it.
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
                      id="addNewIsPrivate"
                      checked={newIsPrivate}
                      onCheckedChange={(v) => setNewIsPrivate(v === true)}
                    />
                    <Label
                      htmlFor="addNewIsPrivate"
                      className="cursor-pointer text-sm font-normal"
                    >
                      Private — only me
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
            <Button onClick={handleCreateAndAdd} disabled={creating || !newTitle.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create &amp; add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
