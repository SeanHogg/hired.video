/**
 * SubjectPickerDialog — adds a (subjectKind, subjectId) link to the
 * current studio project. Browses the entities the caller owns —
 * resumes, companies, their own profile — and emits the selected pair
 * back to the host (typically `<ProjectStatusChips>`'s chip list).
 *
 * Self-gating per the DRY rule:
 *   - Each source list returns null when the user has zero entries
 *     (no resumes → no Resume tab); the dialog never asks the consumer
 *     to compute availability.
 *   - The "already linked" filter dedupes entries that are already on
 *     the project — the consumer doesn't pre-filter.
 *
 * Kinds NOT yet covered:
 *   - `job` — needs a per-user job-listing read. The recruiter route
 *     exists but isn't exposed to job_seeker viewers.
 *   - `skills_demo` — not a pickable entity yet (it's a sub-kind of
 *     studio project, populated by the SkillsDemoCreator dialog).
 *   - `creator_credit` — delegate-driven, not user-pickable.
 *
 * Each of those is reachable via the deep-link `/studio?subject=kind:id`
 * pattern from the entity host page.
 */
import { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
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
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useUserEntities, type EntityRow } from "@/lib/studio/use-user-entities";
import type { StudioSubjectKind } from "@shared/studio-subject";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Subjects already on the project — used to grey out duplicates. */
  existing: Array<{ kind: string; id: string }>;
  onPick: (subject: { kind: StudioSubjectKind; id: string }) => void;
}

type TabKey = "resume" | "profile" | "company" | "job";

export default function SubjectPickerDialog({
  open,
  onOpenChange,
  existing,
  onPick,
}: Props) {
  const [tab, setTab] = useState<TabKey>("resume");
  const { resumes, companies, jobs, profile } = useUserEntities(open);

  const isLinked = useMemo(() => {
    const set = new Set(existing.map((s) => `${s.kind}:${s.id}`));
    return (kind: StudioSubjectKind, id: string) => set.has(`${kind}:${id}`);
  }, [existing]);

  function handlePick(kind: StudioSubjectKind, id: string) {
    onPick({ kind, id });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a subject</DialogTitle>
          <DialogDescription>
            Tie this project to one of your resumes, your profile, or a
            company you own. Linked subjects power the per-entity media
            scrollers (EntityMedia).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="resume" className="gap-1.5 text-xs">
              <ScrollText className="h-3.5 w-3.5" />
              Resumes
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              Company
            </TabsTrigger>
            <TabsTrigger value="job" className="gap-1.5 text-xs">
              <Briefcase className="h-3.5 w-3.5" />
              Jobs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resume" className="mt-3">
            <SourceList
              rows={resumes}
              kind="resume"
              isLinked={isLinked}
              onPick={handlePick}
              emptyLabel="You don't have any resumes yet."
            />
          </TabsContent>

          <TabsContent value="profile" className="mt-3">
            <SourceList
              rows={profile ? [profile] : []}
              kind="profile"
              isLinked={isLinked}
              onPick={handlePick}
              emptyLabel="Sign in to link your profile."
            />
          </TabsContent>

          <TabsContent value="company" className="mt-3">
            <SourceList
              rows={companies}
              kind="company"
              isLinked={isLinked}
              onPick={handlePick}
              emptyLabel="You don't own any companies. Companies linked via membership aren't pickable here."
            />
          </TabsContent>

          <TabsContent value="job" className="mt-3">
            <SourceList
              rows={jobs}
              kind="job"
              isLinked={isLinked}
              onPick={handlePick}
              emptyLabel="You haven't posted any jobs. Job listings authored elsewhere aren't pickable here."
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SourceList({
  rows,
  kind,
  isLinked,
  onPick,
  emptyLabel,
}: {
  rows: EntityRow[] | null;
  kind: StudioSubjectKind;
  isLinked: (kind: StudioSubjectKind, id: string) => boolean;
  onPick: (kind: StudioSubjectKind, id: string) => void;
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
      {rows.map((row) => {
        const linked = isLinked(kind, row.id);
        return (
          <li key={row.id}>
            <Button
              type="button"
              variant="ghost"
              disabled={linked}
              onClick={() => onPick(kind, row.id)}
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
              {linked && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Linked
                </span>
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
