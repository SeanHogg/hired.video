/**
 * ItemSkillBadges — drop-in widget that surfaces "skills demonstrated here"
 * inline on any resume item (work, volunteer, project, education,
 * certificate, award, publication). Reads `content.skillEvidence` and
 * filters to evidence rows whose `referenceId` matches this item's id.
 *
 * Self-gating per the DRY rule: takes only `{ itemId, content }` and
 * decides for itself whether to render anything. Returns null when the
 * item has no bound skills, when itemId is missing, or when content has
 * no evidence array. Consumers don't pass `hasSkills` or `showSkills`
 * booleans — the widget is responsible for deciding.
 *
 * The same component renders the inline badges AND the "View graph"
 * button that opens a focused subgraph modal. Both behaviors live here
 * so the resume renderer just drops one component per item type.
 */

import { useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  Folder,
  GraduationCap,
  Heart,
  Network,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  enrichSkillsWithEvidence,
  indexResolvedItems,
  listResolvableItems,
  type ResolvedItem,
} from "@shared/skill-evidence";
import type {
  ResumeData,
  Skill,
  SkillEvidence,
  SkillEvidenceItemType,
  SkillLevel,
} from "@/types/resume";
import SkillNetwork from "@/components/SkillNetwork";

const LEVEL_COLORS: Record<SkillLevel, string> = {
  Beginner: "#94a3b8",
  Intermediate: "#0ea5e9",
  Advanced: "#8b5cf6",
  Expert: "#f59e0b",
};

const ITEM_TYPE_ICON: Record<SkillEvidenceItemType, React.ReactNode> = {
  work: <Briefcase className="h-3 w-3" />,
  volunteer: <Heart className="h-3 w-3" />,
  project: <Folder className="h-3 w-3" />,
  education: <GraduationCap className="h-3 w-3" />,
  certificate: <Award className="h-3 w-3" />,
  award: <Award className="h-3 w-3" />,
  publication: <BookOpen className="h-3 w-3" />,
};

interface Props {
  itemId: string | undefined | null;
  content: ResumeData | undefined | null;
  /** How many badges to show inline before collapsing to a "+N more"
   *  affordance. Default 5 — keeps a single-row footer on most items. */
  maxInline?: number;
  /** Visual variant — "footer" (default) renders left-aligned beneath an
   *  item, "compact" renders smaller for tight layouts. */
  variant?: "footer" | "compact";
}

export default function ItemSkillBadges({
  itemId,
  content,
  maxInline = 5,
  variant = "footer",
}: Props) {
  const [graphOpen, setGraphOpen] = useState(false);

  const evidence = useMemo<SkillEvidence[]>(() => {
    if (!itemId || !content) return [];
    const all = (content.skillEvidence ?? []) as SkillEvidence[];
    return all.filter((e) => e.referenceId === itemId);
  }, [itemId, content?.skillEvidence]);

  const enrichedSkillsByName = useMemo(() => {
    const map = new Map<string, Skill>();
    if (!content) return map;
    for (const s of enrichSkillsWithEvidence(content)) {
      if (s.name) map.set(s.name.toLowerCase().trim(), s);
    }
    return map;
  }, [content]);

  // Self-gating: nothing to render.
  if (evidence.length === 0) return null;

  // Dedupe by skill name across evidence rows for this item — same skill
  // shouldn't render two badges if the LLM and the heuristic both bound
  // it (the merge dedupes on save, but defensive on read too).
  const uniqueByName = new Map<string, SkillEvidence>();
  for (const ev of evidence) {
    const key = ev.skillName.toLowerCase().trim();
    if (!uniqueByName.has(key)) uniqueByName.set(key, ev);
  }
  const ordered = [...uniqueByName.values()];

  const visible = ordered.slice(0, maxInline);
  const overflow = ordered.length - visible.length;

  const sizeClass = variant === "compact" ? "text-[10px] px-1.5 py-0 h-5" : "text-xs";
  const wrapperClass =
    variant === "compact"
      ? "flex flex-wrap items-center gap-1 mt-1 print:hidden"
      : "flex flex-wrap items-center gap-1.5 mt-3 print:hidden";

  return (
    <>
      <div data-print-hide className={wrapperClass}>
        <Sparkles className={variant === "compact" ? "h-3 w-3 text-muted-foreground" : "h-3.5 w-3.5 text-muted-foreground"} />
        {visible.map((ev) => {
          const skill = enrichedSkillsByName.get(ev.skillName.toLowerCase().trim());
          const level = skill?.level as SkillLevel | undefined;
          const color = level ? LEVEL_COLORS[level] : undefined;
          return (
            <Badge
              key={ev.id}
              variant="outline"
              className={sizeClass}
              style={
                color
                  ? {
                      background: `${color}1a`,
                      borderColor: color,
                      color,
                    }
                  : undefined
              }
              title={level ? `${ev.skillName} · ${level}` : ev.skillName}
            >
              {ev.skillName}
            </Badge>
          );
        })}
        {overflow > 0 && (
          <Badge variant="secondary" className={sizeClass}>
            +{overflow} more
          </Badge>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={variant === "compact" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs"}
          onClick={() => setGraphOpen(true)}
          title="Open the skill network focused on this item"
        >
          <Network className={variant === "compact" ? "h-2.5 w-2.5 mr-1" : "h-3 w-3 mr-1"} />
          View graph
        </Button>
      </div>

      <SkillSubgraphDialog
        open={graphOpen}
        onOpenChange={setGraphOpen}
        itemId={itemId!}
        content={content!}
      />
    </>
  );
}

// ─── Focused subgraph modal ────────────────────────────────────────────────

/**
 * Modal that renders a SkillNetwork limited to the focused item + the
 * skills bound to it (and other items those skills are bound to, so the
 * cross-position overlap is visible — that's the "where else did this
 * candidate use Python?" answer the user is fishing for when they click
 * "View graph" on a single position).
 *
 * Implementation: build a synthetic `ResumeData` that contains only the
 * subset of skills/items/evidence in scope, then hand it to SkillNetwork.
 * The visualizer doesn't need to know it's looking at a slice — same
 * codepath, same legend, same zoom controls.
 */
function SkillSubgraphDialog({
  open,
  onOpenChange,
  itemId,
  content,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  itemId: string;
  content: ResumeData;
}) {
  // Compute the slice once per render — cheap because the resume content
  // is already in memory and the filtering is O(skills + evidence + items).
  const focused = useMemo(() => {
    const allEvidence = (content.skillEvidence ?? []) as SkillEvidence[];
    const items = listResolvableItems(content);
    const itemIndex = indexResolvedItems(items);
    const focusedItem = itemIndex.get(itemId);
    if (!focusedItem) return null;

    // Skills bound to THIS item.
    const skillNamesForItem = new Set(
      allEvidence
        .filter((e) => e.referenceId === itemId)
        .map((e) => e.skillName.toLowerCase().trim()),
    );
    if (skillNamesForItem.size === 0) return null;

    // Other items those skills are bound to — so the modal shows the
    // candidate's skill network *centered* on this item but with the
    // adjacent positions visible too. That's what "overlay" means.
    const evidenceInScope = allEvidence.filter((e) =>
      skillNamesForItem.has(e.skillName.toLowerCase().trim()),
    );
    const itemIdsInScope = new Set(evidenceInScope.map((e) => e.referenceId));

    const skillRows = (content.skills ?? []).filter((s: Skill) => {
      // A skill is in scope if it appears in `skillNamesForItem` either by
      // its own name or as one of its keywords.
      const own = (s.name ?? "").toLowerCase().trim();
      if (skillNamesForItem.has(own)) return true;
      return (s.keywords ?? []).some((kw) =>
        skillNamesForItem.has(kw.toLowerCase().trim()),
      );
    });

    const filterById = <T extends { id?: string }>(arr: T[] | undefined): T[] =>
      (arr ?? []).filter((it) => it.id && itemIdsInScope.has(it.id));

    const slice: ResumeData = {
      ...content,
      work: filterById(content.work),
      volunteer: filterById(content.volunteer),
      projects: filterById(content.projects),
      education: filterById(content.education),
      certificates: filterById(content.certificates),
      awards: filterById(content.awards),
      publications: filterById(content.publications),
      skills: skillRows,
      skillEvidence: evidenceInScope,
    } as ResumeData;

    return { slice, focusedItem };
  }, [content, itemId]);

  const itemTypeColor: Record<SkillEvidenceItemType, string> = {
    work: "text-emerald-600",
    volunteer: "text-pink-600",
    project: "text-cyan-600",
    education: "text-indigo-600",
    certificate: "text-amber-600",
    award: "text-rose-600",
    publication: "text-orange-600",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            {focused
              ? `Skill graph — ${focused.focusedItem.title}`
              : "Skill graph"}
          </DialogTitle>
          {focused?.focusedItem.organization && (
            <p
              className={`text-sm ${itemTypeColor[focused.focusedItem.itemType] ?? "text-muted-foreground"}`}
            >
              {focused.focusedItem.organization}
            </p>
          )}
        </DialogHeader>
        {focused ? (
          // Reuse the full SkillNetwork component on the slice. The component
          // self-gates owner controls based on identity props — we leave
          // them undefined here so the dialog stays read-only.
          <SkillNetwork resumeData={focused.slice} title="" />
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            No skills bound to this item yet. Use the resume editor's
            Skills section to attach a position, or click Rebuild Evidence
            on the main Skill Network.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
