/**
 * Section bodies of the résumé renderer — one case per data section, each
 * honouring the block's layout (timeline / list / grid). Every entry is
 * wrapped with its content path (`<section>.<stored index>`, never the
 * sorted render index) so review annotations land on the right row and the
 * page's inline-edit mode (inline-edit.tsx) writes the right field. Entries
 * with a stable id carry it, so a media drop can bind to them (#2153).
 *
 * The dated entry sections (work / education / volunteer) live here; the
 * list-shaped ones are in section-bodies-lists.tsx.
 */
import { Building, GraduationCap, Heart } from "lucide-react";
import type { ThemeStyles } from "@/lib/resume-template-themes";
import ItemSkillBadges from "@/components/ItemSkillBadges";
import ItemMediaStrip from "@/components/ItemMediaStrip";
import { workEntryTags, type Resume } from "@/types/resume";
import type { ResumeSectionKey, SectionBlock } from "@/types/resume-template";
import { ListEntry, TimelineItem, type TimelineItemProps } from "./entry-primitives";
import { EditableText, useResumeInlineEditing } from "./inline-edit";
import { renderListSectionBody } from "./section-bodies-lists";
import { sortByDate } from "./resume-dates";

type Density = { section: string; entry: string };
type Content = NonNullable<Resume["content"]>;

/** One dated entry, in the shape both entry layouts take. */
type EntryRow = Omit<TimelineItemProps, "icon" | "isLast" | "theme" | "footer"> & { id?: string };

/** Render a dated section's entries as a timeline or a list (DRY: work,
 *  education and volunteer differ only in how an entry maps to a row). */
function entrySection<T extends { id?: string; startDate?: string; endDate?: string }>(
  items: T[],
  section: SectionBlock,
  data: Content,
  theme: ThemeStyles,
  density: Density,
  icon: TimelineItemProps["icon"],
  toRow: (item: T, basePath: string) => EntryRow,
): React.ReactNode {
  if (items.length === 0) return null;
  const sorted = sortByDate(items, section.sortBy ?? "date_desc");
  const footer = (id: string | undefined) => (
    <>
      <ItemSkillBadges itemId={id} content={data} />
      {section.showMedia && <ItemMediaStrip itemId={id} metaData={data.metaData} variant="tiles" />}
    </>
  );
  const rows = sorted.map((item) => toRow(item, `${section.key}.${items.indexOf(item)}`));
  if (section.layout === "timeline") {
    return (
      <div className={density.entry}>
        {rows.map(({ id, ...row }, idx) => (
          <TimelineItem key={idx} {...row} itemId={id} icon={icon} isLast={idx === rows.length - 1} theme={theme} footer={footer(id)} />
        ))}
      </div>
    );
  }
  return (
    <div>
      {rows.map(({ id, ...row }, idx) => (
        <ListEntry key={idx} {...row} itemId={id} theme={theme} footer={footer(id)} />
      ))}
    </div>
  );
}

/** "<degree> in <area>" — two fields in inline-edit mode. */
function EducationTitle({ basePath, studyType, area }: { basePath: string; studyType?: string; area?: string }) {
  const editing = useResumeInlineEditing();
  if (!editing) return <>{`${studyType || ""} ${area ? "in " + area : ""}`.trim()}</>;
  return (
    <>
      <EditableText path={`${basePath}.studyType`}>{studyType}</EditableText>{" "}
      <EditableText path={`${basePath}.area`}>{area}</EditableText>
    </>
  );
}

export function renderSectionBody(
  key: ResumeSectionKey,
  section: SectionBlock,
  data: Resume["content"],
  theme: ThemeStyles,
  density: Density,
): React.ReactNode {
  // A resume with null/undefined content (malformed row, fresh draft) must not
  // crash the render — every section reads off `data`.
  if (!data) return null;
  const highlights = (h: string[] | null | undefined) => (section.showHighlights ? h ?? undefined : undefined);

  switch (key) {
    case "work":
      return entrySection(data.work ?? [], section, data, theme, density, Building, (w, basePath) => ({
        id: w.id,
        basePath,
        title: <EditableText path={`${basePath}.position`}>{w.position || ""}</EditableText>,
        subtitle: <EditableText path={`${basePath}.name`}>{w.name || ""}</EditableText>,
        subtitleText: w.name ?? "",
        startDate: w.startDate,
        endDate: w.endDate || "Present",
        description: w.summary,
        highlights: highlights(w.highlights),
        tags: workEntryTags(w).map((t) => t.label),
      }));
    case "education":
      return entrySection(data.education ?? [], section, data, theme, density, GraduationCap, (e, basePath) => ({
        id: e.id,
        basePath,
        title: <EducationTitle basePath={basePath} studyType={e.studyType} area={e.area} />,
        subtitle: <EditableText path={`${basePath}.institution`}>{e.institution || ""}</EditableText>,
        subtitleText: e.institution ?? "",
        startDate: e.startDate,
        endDate: e.endDate,
        description: e.score ? `GPA: ${e.score}` : undefined,
      }));
    case "volunteer":
      return entrySection(data.volunteer ?? [], section, data, theme, density, Heart, (v, basePath) => ({
        id: v.id,
        basePath,
        title: <EditableText path={`${basePath}.position`}>{v.position || ""}</EditableText>,
        subtitle: <EditableText path={`${basePath}.organization`}>{v.organization || ""}</EditableText>,
        subtitleText: v.organization ?? "",
        startDate: v.startDate,
        endDate: v.endDate || "Present",
        description: v.summary,
        highlights: highlights(v.highlights),
      }));
    default:
      return renderListSectionBody(key, section, data, theme);
  }
}
