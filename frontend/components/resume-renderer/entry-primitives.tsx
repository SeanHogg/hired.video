/**
 * Entry primitives of the résumé renderer — a timeline row and a list row
 * (work, education, volunteer). `basePath` is the entry's content path
 * (`work.2`): the entry, its summary and each bullet carry review
 * annotations (annotations.tsx) when a review is on the page.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, ChevronRight } from "lucide-react";
import type { ThemeStyles } from "@/lib/resume-template-themes";
import { AnnotatedBlock, AnnotatedText, useHasAnnotationsWithin } from "./annotations";
import { dateRange } from "./resume-dates";
import { useResumeInlineEditing } from "./inline-edit";

export interface TimelineItemProps {
  /** Text, or an `EditableText` for the page's inline-edit mode. */
  title: React.ReactNode;
  subtitle: React.ReactNode;
  /** The subtitle's stored text: a list row draws its subtitle line only
   *  when there is some (or the page is the form, so it can be typed). */
  subtitleText?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  highlights?: string[];
  /** Small badges (employment / location type) shown under the subtitle. */
  tags?: string[];
  icon: React.ComponentType<any>;
  isLast?: boolean;
  theme: ThemeStyles;
  /** Content path of this entry (`work.2`) — anchors review annotations. */
  basePath?: string;
  /** Slot for per-item content rendered below the description / highlights.
   *  The skill-evidence widget drops in here so each work/volunteer/project
   *  row shows the skills demonstrated there. The slot is null-safe and
   *  the widget self-gates, so consumers always pass it — no boolean. */
  footer?: React.ReactNode;
  /** The entry's stable id — marks it so a media drop can bind to it
   *  (resume-media-binding.ts). */
  itemId?: string;
}

/** Employment / location badges shared by both work entry layouts (DRY). */
function EntryTags({ tags, theme }: { tags?: string[]; theme: ThemeStyles }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${theme.accentBgSoft} ${theme.accentText}`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function TimelineItem({
  title,
  subtitle,
  startDate,
  endDate,
  description,
  highlights,
  tags,
  icon: Icon,
  isLast,
  theme,
  footer,
  basePath,
  itemId,
}: TimelineItemProps) {
  const { t } = useTranslation();
  const [toggled, setExpanded] = useState(false);
  // An entry a review annotates opens, so its marked bullets are visible;
  // in inline-edit mode every entry is open so all of it is editable.
  const annotated = useHasAnnotationsWithin(basePath);
  const editing = useResumeInlineEditing();
  const expanded = toggled || annotated || editing;
  const range = dateRange(startDate, endDate);

  return (
    <AnnotatedBlock path={basePath} className="relative" itemId={itemId}>
      {!isLast && <div className={`absolute left-6 top-12 w-0.5 h-full ${theme.accentBgSoft}`} />}
      <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={editing ? undefined : () => setExpanded(!expanded)}>
        <div className={`flex-shrink-0 w-12 h-12 ${theme.accentBgSoft} rounded-full flex items-center justify-center relative z-10`}>
          <Icon className={`w-6 h-6 ${theme.accentText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className={`${theme.accentText} font-medium`}>{subtitle}</p>
              <EntryTags tags={tags} theme={theme} />
            </div>
            <div className="text-right">
              {range && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{range}</span>
                </div>
              )}
              {highlights && highlights.length > 0 && (
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
              )}
            </div>
          </div>
          {description && (
            <p className="text-muted-foreground mt-2">
              <AnnotatedText path={basePath && `${basePath}.summary`}>{description}</AnnotatedText>
            </p>
          )}
          {expanded && highlights && highlights.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{t("headings.keyAchievements")}</h4>
              <ul className="space-y-2">
                {highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <div className={`w-1.5 h-1.5 ${theme.accentBorder} border rounded-full mt-2 flex-shrink-0`} />
                    <span>
                      <AnnotatedText path={basePath && `${basePath}.highlights.${i}`}>{h}</AnnotatedText>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {footer}
        </div>
      </div>
    </AnnotatedBlock>
  );
}

export function ListEntry({ title, subtitle, subtitleText, startDate, endDate, description, highlights, tags, theme, footer, basePath, itemId }: Omit<TimelineItemProps, "icon" | "isLast">) {
  const range = dateRange(startDate, endDate);
  // No empty wrapper: the line exists when it has text, or can be typed.
  const editing = useResumeInlineEditing();
  const showSubtitle = subtitleText === undefined ? Boolean(subtitle) : editing || subtitleText.trim() !== "";
  return (
    <AnnotatedBlock path={basePath} className="py-3 border-b last:border-b-0" itemId={itemId}>
      <div className="flex justify-between items-baseline gap-4">
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          {showSubtitle && <div className={`text-sm ${theme.accentText}`}>{subtitle}</div>}
          <EntryTags tags={tags} theme={theme} />
        </div>
        {range && <div className="text-sm text-muted-foreground whitespace-nowrap">{range}</div>}
      </div>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">
          <AnnotatedText path={basePath && `${basePath}.summary`}>{description}</AnnotatedText>
        </p>
      )}
      {highlights && highlights.length > 0 && (
        <ul className="list-disc list-inside text-sm mt-2 space-y-1">
          {highlights.map((h, i) => (
            <li key={i}>
              <AnnotatedText path={basePath && `${basePath}.highlights.${i}`}>{h}</AnnotatedText>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </AnnotatedBlock>
  );
}
