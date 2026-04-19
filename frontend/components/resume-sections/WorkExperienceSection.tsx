import { Briefcase , X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Work } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface WorkExperienceSectionProps {
  work: Work[];
  sortedWork?: Work[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Work, value: string | string[]) => void;
  onRemove: (index: number) => void;
  onAddHighlight: (workIndex: number) => void;
  onUpdateHighlight: (workIndex: number, highlightIndex: number, value: string) => void;
  onRemoveHighlight: (workIndex: number, highlightIndex: number) => void;
}

export default function WorkExperienceSection({
  work,
  sortedWork,
  onAdd,
  onUpdate,
  onRemove,
  onAddHighlight,
  onUpdateHighlight,
  onRemoveHighlight,
}: WorkExperienceSectionProps) {
  // Always compute stable, correct sort for edit panels:
  // - Current roles first: EndDate null/empty (also handle 'present'/'current'/'now')
  // - Then by most recent end date desc; for current roles, start date desc
  const isCurrent = (end?: string) => {
    const s = (end || '').trim().toLowerCase();
    return s === '' || s === 'present' || s === 'current' || s === 'now';
  };
  const toTime = (val?: string): number | null => {
    if (!val) return null;
    const t = Date.parse(val);
    return Number.isFinite(t) ? t : null;
  };
  const compareWork = (a: Work, b: Work) => {
    const aCur = isCurrent(a.endDate);
    const bCur = isCurrent(b.endDate);
    if (aCur && !bCur) return -1;
    if (!aCur && bCur) return 1;
    if (aCur && bCur) {
      const aStart = toTime(a.startDate);
      const bStart = toTime(b.startDate);
      if (aStart !== null && bStart !== null) return bStart - aStart;
      if (aStart !== null) return -1;
      if (bStart !== null) return 1;
      return 0;
    }
    // both not current
    const aEnd = toTime(a.endDate) ?? toTime(a.startDate);
    const bEnd = toTime(b.endDate) ?? toTime(b.startDate);
    if (aEnd !== null && bEnd !== null) return bEnd - aEnd;
    if (aEnd !== null) return -1;
    if (bEnd !== null) return 1;
    return 0;
  };
  const source = (sortedWork && sortedWork.length ? sortedWork : work);
  const displayWork = source.slice().sort(compareWork);
  const emptyState = {
    icon: <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No work experience added yet.",
    description: 'Click "Add Work Experience" to get started.',
  };

  return (
    <BaseSectionCard
      title="Work Experience"
      onAdd={onAdd}
      addButtonText="Add Work Experience"
      isEmpty={work.length === 0}
      emptyState={emptyState}
    >
      {displayWork.map((workItem, displayIndex) => {
        // Find the original index in the unsorted array for proper updates
        const originalIndex = work.findIndex(item =>
          item.name === workItem.name &&
          item.position === workItem.position &&
          item.startDate === workItem.startDate
        );

        return (
          <BaseSectionItem
            key={originalIndex}
            title={`Work Experience ${displayIndex + 1}`}
            onRemove={() => onRemove(originalIndex)}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company</Label>
                <Input
                  value={workItem.name}
                  onChange={(e) => onUpdate(originalIndex, "name", e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input
                  value={workItem.position}
                  onChange={(e) => onUpdate(originalIndex, "position", e.target.value)}
                  placeholder="Software Engineer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={workItem.startDate}
                  onChange={(e) => onUpdate(originalIndex, "startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={workItem.endDate}
                  onChange={(e) => onUpdate(originalIndex, "endDate", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave empty if this is your current position</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={workItem.url}
                onChange={(e) => onUpdate(originalIndex, "url", e.target.value)}
                placeholder="https://acmecorp.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Summary</Label>
              <Textarea
                value={workItem.summary}
                onChange={(e) => onUpdate(originalIndex, "summary", e.target.value)}
                placeholder="Describe your role and responsibilities..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Key Achievements</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddHighlight(originalIndex)}
                >
                  Add Achievement
                </Button>
              </div>
              <div className="space-y-2">
                {workItem.highlights.map((highlight, highlightIndex) => (
                  <div key={highlightIndex} className="flex gap-2">
                    <Input
                      value={highlight}
                      onChange={(e) =>
                        onUpdateHighlight(originalIndex, highlightIndex, e.target.value)
                      }
                      placeholder="Describe a key achievement..."
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveHighlight(originalIndex, highlightIndex)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </BaseSectionItem>
        );
      })}
    </BaseSectionCard>
  );
}
