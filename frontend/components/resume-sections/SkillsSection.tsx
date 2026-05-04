import { Award, Briefcase, Folder, GraduationCap, Heart, BookOpen, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import type {
  Skill,
  SkillEvidence,
  SkillEvidenceItemType,
  Work,
  Volunteer,
  Project,
  Education,
  Certificate,
  Award as AwardType,
  Publication,
} from "@/types/resume";
import {
  listResolvableItems,
  mergeSkills,
  type ResolvedItem,
} from "@shared/skill-evidence";
import { MergeWidget, useMergeSelection } from "@/components/MergeWidget";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface EvidenceItemBundle {
  work: Work[];
  volunteer: Volunteer[];
  projects: Project[];
  education: Education[];
  certificates: Certificate[];
  awards: AwardType[];
  publications: Publication[];
}

interface SkillsSectionProps {
  skills: Skill[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Skill, value: string | string[]) => void;
  onRemove: (index: number) => void;
  /** Optional evidence wiring — when present, each skill row renders a
   *  "Used at" widget. The editor self-gates: if the parent doesn't pass
   *  these props (e.g. a future caller without evidence support), the
   *  widget simply doesn't render. No prop-drilled `showEvidence` flag. */
  evidence?: SkillEvidence[];
  evidenceItems?: EvidenceItemBundle;
  onAddEvidence?: (
    skillName: string,
    referenceId: string,
    itemType: SkillEvidenceItemType,
  ) => void;
  onRemoveEvidence?: (evidenceId: string) => void;
  /** When provided, the section enables multi-select + Merge UI. The
   *  callback receives the post-merge skills + evidence arrays — the
   *  parent updates its state with both in a single mutation. Without
   *  this callback the merge controls don't render. */
  onReplaceSkillsAndEvidence?: (
    nextSkills: Skill[],
    nextEvidence: SkillEvidence[],
  ) => void;
  /** When provided, items become drag-reorderable. The callback receives
   *  the full reordered array — the parent just calls setSkills(next).
   *  Without it, the section renders without any drag affordance. */
  onReorder?: (next: Skill[]) => void;
}

export default function SkillsSection({
  skills,
  onAdd,
  onUpdate,
  onRemove,
  evidence,
  evidenceItems,
  onAddEvidence,
  onRemoveEvidence,
  onReplaceSkillsAndEvidence,
  onReorder,
}: SkillsSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.skills.title"),
    description: t("messages.empty.skills.description"),
  };

  const evidenceWired =
    !!evidence && !!evidenceItems && !!onAddEvidence && !!onRemoveEvidence;
  const mergeWired = !!onReplaceSkillsAndEvidence;
  const selection = useMergeSelection(skills.length);

  const handleMergeConfirm = (primaryIndex: number) => {
    if (!onReplaceSkillsAndEvidence) return;
    const merged = mergeSkills({
      skills,
      evidence: evidence ?? [],
      selectedIndexes: [...selection.selected],
      primaryIndex,
    });
    onReplaceSkillsAndEvidence(merged.skills, merged.evidence);
    selection.clear();
  };

  // Resolve every evidence-bindable item once for the dropdown — the
  // resolver lives in shared/skill-evidence.ts so the resume page and
  // the editor see the same set of items in the same order.
  const resolvedItems = useMemo<ResolvedItem[]>(() => {
    if (!evidenceItems) return [];
    return listResolvableItems({
      basics: undefined,
      work: evidenceItems.work,
      volunteer: evidenceItems.volunteer,
      education: evidenceItems.education,
      awards: evidenceItems.awards,
      certificates: evidenceItems.certificates,
      publications: evidenceItems.publications,
      skills: [],
      languages: [],
      interests: [],
      references: [],
      projects: evidenceItems.projects,
    });
  }, [evidenceItems]);

  const itemById = useMemo(() => {
    const map = new Map<string, ResolvedItem>();
    for (const it of resolvedItems) map.set(it.id, it);
    return map;
  }, [resolvedItems]);

  const addKeyword = (skillIndex: number) => {
    const updatedKeywords = [...skills[skillIndex].keywords, ""];
    onUpdate(skillIndex, "keywords", updatedKeywords);
  };

  const updateKeyword = (skillIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...skills[skillIndex].keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(skillIndex, "keywords", updatedKeywords);
  };

  const removeKeyword = (skillIndex: number, keywordIndex: number) => {
    const updatedKeywords = skills[skillIndex].keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(skillIndex, "keywords", updatedKeywords);
  };

  const renderSkillItem = (skill: Skill, index: number) => (
    <BaseSectionItem
      key={skill.id ?? `skill-idx-${index}`}
      id={skill.id}
      collapsedSummary={
        skill.name
          ? `${skill.name}${skill.level ? ` · ${skill.level}` : ""}`
          : undefined
      }
      title={
        <span className="inline-flex items-center gap-2">
          {mergeWired && skills.length >= 2 && (
            <Checkbox
              checked={selection.isSelected(index)}
              onCheckedChange={() => selection.toggle(index)}
              aria-label={`Select skill ${index + 1} for merge`}
            />
          )}
          {t("labels.itemNumber.skill", { index: index + 1 })}
        </span>
      }
      onRemove={() => onRemove(index)}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("fields.skillName.label")}</Label>
          <Input
            value={skill.name}
            onChange={(e) => onUpdate(index, "name", e.target.value)}
            placeholder={t("fields.skillName.placeholder")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("fields.proficiencyLevel.label")}</Label>
          <Select
            value={skill.level}
            onValueChange={(value) => onUpdate(index, "level", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("fields.proficiencyLevel.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">{t("labels.skillLevel.beginner")}</SelectItem>
              <SelectItem value="Intermediate">{t("labels.skillLevel.intermediate")}</SelectItem>
              <SelectItem value="Advanced">{t("labels.skillLevel.advanced")}</SelectItem>
              <SelectItem value="Expert">{t("labels.skillLevel.expert")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t("fields.relatedKeywords.label")}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addKeyword(index)}
          >
            {t("actions.addKeyword")}
          </Button>
        </div>
        <div className="space-y-2">
          {skill.keywords.map((keyword, keywordIndex) => (
            <div key={keywordIndex} className="flex gap-2">
              <Input
                value={keyword}
                onChange={(e) => updateKeyword(index, keywordIndex, e.target.value)}
                placeholder={t("fields.relatedKeywords.placeholder")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeKeyword(index, keywordIndex)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {evidenceWired && (
        <SkillEvidenceEditor
          skillName={skill.name}
          skillKeywords={skill.keywords}
          evidence={evidence!}
          items={resolvedItems}
          itemById={itemById}
          onAdd={onAddEvidence!}
          onRemove={onRemoveEvidence!}
        />
      )}
    </BaseSectionItem>
  );

  return (
    <BaseSectionCard
      title={t("tabs.skills")}
      onAdd={onAdd}
      addButtonText={t("actions.addSkill")}
      isEmpty={skills.length === 0}
      emptyState={emptyState}
    >
      {mergeWired && (
        <MergeWidget
          noun="skill"
          items={skills}
          selectedIndexes={[...selection.selected]}
          onClear={selection.clear}
          onConfirm={handleMergeConfirm}
          renderLabel={(s: Skill) => (
            <span>
              <strong>{s.name || "(unnamed)"}</strong>
              {s.level ? ` · ${s.level}` : ""}
              {s.keywords && s.keywords.length > 0
                ? ` — keywords: ${s.keywords.slice(0, 4).join(", ")}${s.keywords.length > 4 ? "…" : ""}`
                : ""}
            </span>
          )}
        />
      )}
      {mergeWired && skills.length >= 2 && selection.selectedCount === 0 && (
        <p className="text-xs text-muted-foreground -mt-2 mb-2">
          Tip: tick two or more skills to merge duplicates (e.g. AWS +
          Amazon Web Services into one entry).
        </p>
      )}
      <SortableList
        items={skills}
        getId={(s, i) => s.id ?? `skill-idx-${i}`}
        onReorder={onReorder}
      >
        {(skill, index) => renderSkillItem(skill, index)}
      </SortableList>
    </BaseSectionCard>
  );
}

// ─── Used-at chip editor ────────────────────────────────────────────────────

const ITEM_TYPE_ICON: Record<SkillEvidenceItemType, React.ReactNode> = {
  work: <Briefcase className="h-3 w-3" />,
  volunteer: <Heart className="h-3 w-3" />,
  project: <Folder className="h-3 w-3" />,
  education: <GraduationCap className="h-3 w-3" />,
  certificate: <Award className="h-3 w-3" />,
  award: <Award className="h-3 w-3" />,
  publication: <BookOpen className="h-3 w-3" />,
};

const ITEM_TYPE_GROUP_ORDER: SkillEvidenceItemType[] = [
  "work",
  "project",
  "volunteer",
  "education",
  "certificate",
  "award",
  "publication",
];

const ITEM_TYPE_LABEL: Record<SkillEvidenceItemType, string> = {
  work: "Work",
  volunteer: "Volunteer",
  project: "Projects",
  education: "Education",
  certificate: "Certificates",
  award: "Awards",
  publication: "Publications",
};

/**
 * Per-skill chip editor: shows every item the candidate has bound to this
 * skill (each chip is a section item), lets the owner add another via a
 * grouped popover dropdown, and removes via the chip's X. Self-contained —
 * the parent only supplies the action handlers + the resolved item list.
 *
 * Self-gating: returns null when the skill has no name yet (binding
 * something to a blank skill row would create an orphan). No prop-drilled
 * `canEdit` boolean — the parent already gated the wiring by passing the
 * evidence handlers.
 */
function SkillEvidenceEditor({
  skillName,
  skillKeywords,
  evidence,
  items,
  itemById,
  onAdd,
  onRemove,
}: {
  skillName: string;
  skillKeywords: string[];
  evidence: SkillEvidence[];
  items: ResolvedItem[];
  itemById: Map<string, ResolvedItem>;
  onAdd: (
    skillName: string,
    referenceId: string,
    itemType: SkillEvidenceItemType,
  ) => void;
  onRemove: (evidenceId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const trimmed = skillName.trim();
  if (!trimmed) return null;

  // A "skill" can be bound either by its own name OR by appearing as a
  // keyword under a category. Match by name first; if the row is itself
  // a category (Cloud Architecture (Expert) with keywords [AWS, ...]),
  // pull in the keyword bindings too so the user can review every
  // tied-down position from one place.
  const lowerName = trimmed.toLowerCase();
  const lowerKeywords = new Set(skillKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const ownEvidence = evidence.filter((e) => {
    const en = e.skillName.toLowerCase().trim();
    return en === lowerName || lowerKeywords.has(en);
  });

  // Group evidence rows by referenceId so each item renders as ONE chip
  // even when multiple evidence rows reference it (a common shape after
  // skill merges: the surviving primary "AWS" carries a keyword
  // "Amazon Web Services" + "AWS Cloud", and the heuristic binder may
  // have created a row under each name pointing at the same job). Prior
  // to 2026-05-04 each row rendered as its own chip — the user saw the
  // same job listed 5+ times. The X button now removes ALL underlying
  // evidence rows for the group, not just the first.
  const evidenceByItem = new Map<string, SkillEvidence[]>();
  for (const ev of ownEvidence) {
    const list = evidenceByItem.get(ev.referenceId) ?? [];
    list.push(ev);
    evidenceByItem.set(ev.referenceId, list);
  }
  const chipGroups = [...evidenceByItem.entries()];

  const alreadyBoundIds = new Set(ownEvidence.map((e) => e.referenceId));
  const availableItems = items.filter((it) => !alreadyBoundIds.has(it.id));

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Used at</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={availableItems.length === 0}
              title={
                availableItems.length === 0
                  ? "Every section item is already bound to this skill"
                  : "Bind this skill to a position, project, or other section item"
              }
            >
              <Plus className="h-3 w-3 mr-1" />
              Add usage
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 max-h-72 overflow-y-auto">
            {availableItems.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No more items to bind.
              </div>
            ) : (
              <div className="py-1">
                {ITEM_TYPE_GROUP_ORDER.map((groupType) => {
                  const group = availableItems.filter((it) => it.itemType === groupType);
                  if (group.length === 0) return null;
                  return (
                    <div key={groupType}>
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
                        {ITEM_TYPE_LABEL[groupType]}
                      </div>
                      {group.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2"
                          onClick={() => {
                            onAdd(trimmed, it.id, it.itemType);
                            setOpen(false);
                          }}
                        >
                          <span className="mt-0.5 text-muted-foreground">
                            {ITEM_TYPE_ICON[it.itemType]}
                          </span>
                          <span className="flex-1 min-w-0">
                            <div className="truncate font-medium">{it.title}</div>
                            {it.organization && (
                              <div className="truncate text-xs text-muted-foreground">
                                {it.organization}
                              </div>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {chipGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Not yet bound to a position. Click "Add usage" to link this skill
          to a job, project, or volunteer role — that's what proves you
          actually used it.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chipGroups.map(([referenceId, rows]) => {
            const item = itemById.get(referenceId);
            const label = item
              ? `${item.title}${item.organization ? ` · ${item.organization}` : ""}`
              : rows[0]?.skillName ?? referenceId;
            const itemType = rows[0]?.itemType;
            return (
              <Badge
                key={referenceId}
                variant="outline"
                className="inline-flex items-center gap-1 pr-1"
              >
                <span className="text-muted-foreground">
                  {itemType ? ITEM_TYPE_ICON[itemType] : null}
                </span>
                <span>{label}</span>
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                  onClick={() => {
                    // Remove every underlying evidence row tied to this
                    // item — otherwise unticking the chip would leave
                    // ghost rows that re-appear as duplicate chips on
                    // the next render after a merge.
                    for (const r of rows) onRemove(r.id);
                  }}
                  aria-label={`Unbind from ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
