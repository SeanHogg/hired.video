/**
 * ContentLinkPicker — a reusable icon-button that opens a dialog
 * listing every entity the user owns (resumes / profile / companies /
 * posted jobs) and emits the canonical public-page URL for the picked
 * row back to the caller. Designed to sit next to ANY URL input so
 * authors don't have to copy-paste deep-links from another tab.
 *
 * Self-gating per the DRY rule:
 *   - Each tab's row list hides when empty; the consumer doesn't have
 *     to know which entity kinds the user has populated.
 *   - The URL pattern is owned by `entityUrl()` in `use-user-entities.ts`
 *     — never reconstruct routes inline.
 *   - Data fetch is deferred until the dialog opens (`enabled={open}`)
 *     so dozens of mounted pickers don't fan out to 3× API calls each.
 *
 * Drop next to any URL input:
 *   <Input value={url} onChange={…} />
 *   <ContentLinkPicker onSelect={setUrl} />
 */
"use client";

import { useState } from "react";
import {
  Briefcase,
  Building2,
  Link2,
  Loader2,
  ScrollText,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useUserEntities, entityUrl, type EntityRow } from "@/lib/studio/use-user-entities";
import type { StudioSubjectKind } from "@shared/studio-subject";

interface Props {
  /** Called with the absolute path (e.g. `/resume/abc-123`) when the
   *  user picks an entity. The host typically writes this straight
   *  into a URL form input. */
  onSelect: (url: string) => void;
  /** Optional tab restriction. Useful when the URL field is
   *  conceptually a "pick a job" rather than "pick any of your
   *  content". Omit to show every available kind. */
  kinds?: ReadonlyArray<EntityTab>;
  /** Tooltip / aria-label for the trigger. Defaults to "Link to your
   *  content". */
  label?: string;
}

type EntityTab = "resume" | "profile" | "company" | "job";

const ALL_TABS: ReadonlyArray<EntityTab> = ["resume", "profile", "company", "job"];

export default function ContentLinkPicker({ onSelect, kinds = ALL_TABS, label }: Props) {
  const [open, setOpen] = useState(false);
  const entities = useUserEntities(open);
  const [tab, setTab] = useState<EntityTab>(kinds[0] ?? "resume");

  function handlePick(kind: StudioSubjectKind, id: string) {
    onSelect(entityUrl(kind, id));
    setOpen(false);
  }

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0"
      aria-label={label ?? "Link to your content"}
      title={label ?? "Link to your content"}
    >
      <Link2 className="h-3.5 w-3.5" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to your content</DialogTitle>
          <DialogDescription>
            Pick a resume, profile, company, or job you've created. The
            URL field will fill with that page's public link.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as EntityTab)}>
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))` }}
          >
            {kinds.includes("resume") && (
              <TabsTrigger value="resume" className="gap-1.5 text-xs">
                <ScrollText className="h-3.5 w-3.5" />
                Resumes
              </TabsTrigger>
            )}
            {kinds.includes("profile") && (
              <TabsTrigger value="profile" className="gap-1.5 text-xs">
                <User className="h-3.5 w-3.5" />
                Profile
              </TabsTrigger>
            )}
            {kinds.includes("company") && (
              <TabsTrigger value="company" className="gap-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                Company
              </TabsTrigger>
            )}
            {kinds.includes("job") && (
              <TabsTrigger value="job" className="gap-1.5 text-xs">
                <Briefcase className="h-3.5 w-3.5" />
                Jobs
              </TabsTrigger>
            )}
          </TabsList>

          {kinds.includes("resume") && (
            <TabsContent value="resume" className="mt-3">
              <PickList
                rows={entities.resumes}
                onPick={(id) => handlePick("resume", id)}
                emptyLabel="You don't have any resumes yet."
              />
            </TabsContent>
          )}
          {kinds.includes("profile") && (
            <TabsContent value="profile" className="mt-3">
              <PickList
                rows={entities.profile ? [entities.profile] : []}
                onPick={(id) => handlePick("profile", id)}
                emptyLabel="Sign in to link your profile."
              />
            </TabsContent>
          )}
          {kinds.includes("company") && (
            <TabsContent value="company" className="mt-3">
              <PickList
                rows={entities.companies}
                onPick={(id) => handlePick("company", id)}
                emptyLabel="You don't own any companies."
              />
            </TabsContent>
          )}
          {kinds.includes("job") && (
            <TabsContent value="job" className="mt-3">
              <PickList
                rows={entities.jobs}
                onPick={(id) => handlePick("job", id)}
                emptyLabel="You haven't posted any jobs."
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PickList({
  rows,
  onPick,
  emptyLabel,
}: {
  rows: EntityRow[] | null;
  onPick: (id: string) => void;
  emptyLabel: string;
}) {
  if (rows === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="flex max-h-[280px] flex-col gap-1 overflow-y-auto pr-1">
      {rows.map((row) => (
        <li key={row.id}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onPick(row.id)}
            className="h-auto w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.label}</p>
              {row.hint && (
                <p className="truncate text-[10px] text-muted-foreground">
                  {row.hint}
                </p>
              )}
            </div>
          </Button>
        </li>
      ))}
    </ul>
  );
}
