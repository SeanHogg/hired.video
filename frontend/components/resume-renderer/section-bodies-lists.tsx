/**
 * The list-shaped section bodies of the résumé renderer (skills, languages,
 * projects, awards, certificates, publications, interests, references) —
 * split from section-bodies.tsx, which keeps the dated entry sections.
 * Entries carry their content path (review annotations + inline edit) and,
 * when they have one, their stable id (media drop binding, #2153).
 */
import { Calendar, ExternalLink } from "lucide-react";
import type { ThemeStyles } from "@/lib/resume-template-themes";
import ItemSkillBadges from "@/components/ItemSkillBadges";
import ItemMediaStrip from "@/components/ItemMediaStrip";
import type { Resume } from "@/types/resume";
import type { ResumeSectionKey, SectionBlock } from "@/types/resume-template";
import { AnnotatedBlock, AnnotatedText } from "./annotations";
import { EditableText } from "./inline-edit";
import { RESUME_ITEM_ID_ATTR } from "@/lib/studio/document/resume-media-binding";

type Content = NonNullable<Resume["content"]>;

function gridColsClass(cols: 1 | 2 | 3 | 4 = 3): string {
  switch (cols) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 md:grid-cols-2";
    case 4:
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
    case 3:
    default:
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  }
}

function Chips({ words, theme }: { words?: string[]; theme: ThemeStyles }) {
  if (!words || words.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {words.map((kw, ki) => (
        <span key={ki} className={`px-2 py-0.5 ${theme.accentBgSoft} ${theme.accentText} text-xs rounded`}>{kw}</span>
      ))}
    </div>
  );
}

export function renderListSectionBody(
  key: ResumeSectionKey,
  section: SectionBlock,
  data: Content,
  theme: ThemeStyles,
): React.ReactNode {
  const layout = section.layout;

  switch (key) {
    case "skills": {
      const items = data.skills ?? [];
      if (items.length === 0) return null;
      if (layout === "grid") {
        return (
          <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
            {items.map((skill, idx) => (
              <AnnotatedBlock key={idx} path={`skills.${idx}`} className="p-3 border rounded-lg">
                <h3 className="font-semibold mb-1"><EditableText path={`skills.${idx}.name`}>{skill.name}</EditableText></h3>
                {skill.level && <p className="text-xs text-muted-foreground mb-1"><EditableText path={`skills.${idx}.level`}>{skill.level}</EditableText></p>}
                {skill.keywords && skill.keywords.length > 0 && <Chips words={skill.keywords} theme={theme} />}
              </AnnotatedBlock>
            ))}
          </div>
        );
      }
      // list / compact
      return (
        <ul className="space-y-2 text-sm">
          {items.map((skill, idx) => (
            <li key={idx}>
              <AnnotatedBlock path={`skills.${idx}`} className="flex flex-wrap gap-2 items-baseline">
                <span className="font-semibold"><EditableText path={`skills.${idx}.name`}>{skill.name}</EditableText></span>
                {skill.level && <span className="text-xs text-muted-foreground">· <EditableText path={`skills.${idx}.level`}>{skill.level}</EditableText></span>}
                {skill.keywords && skill.keywords.length > 0 && (
                  <span className="text-muted-foreground">· {skill.keywords.join(", ")}</span>
                )}
              </AnnotatedBlock>
            </li>
          ))}
        </ul>
      );
    }
    case "languages": {
      const items = data.languages ?? [];
      if (items.length === 0) return null;
      if (layout === "grid") {
        return (
          <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
            {items.map((lang, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <h3 className="font-semibold">
                  <AnnotatedText path={`languages.${idx}`}><EditableText path={`languages.${idx}.language`}>{lang.language}</EditableText></AnnotatedText>
                </h3>
                {lang.fluency && <p className="text-sm text-muted-foreground"><EditableText path={`languages.${idx}.fluency`}>{lang.fluency}</EditableText></p>}
              </div>
            ))}
          </div>
        );
      }
      return (
        <ul className="space-y-1 text-sm">
          {items.map((l, i) => (
            <li key={i}>
              <AnnotatedText path={`languages.${i}`}>
                <span className="font-semibold"><EditableText path={`languages.${i}.language`}>{l.language}</EditableText></span>
              </AnnotatedText>
              {l.fluency && <span className="text-muted-foreground"> · <EditableText path={`languages.${i}.fluency`}>{l.fluency}</EditableText></span>}
            </li>
          ))}
        </ul>
      );
    }
    case "projects": {
      const items = data.projects ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-4">
          {items.map((p, idx) => (
            <AnnotatedBlock key={idx} path={`projects.${idx}`} itemId={p.id} className="border-b pb-4 last:border-b-0 last:pb-0">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold"><EditableText path={`projects.${idx}.name`}>{p.name}</EditableText></h3>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${theme.accentText} hover:underline flex items-center gap-1`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              {(p.startDate || p.endDate) && <p className="text-xs text-muted-foreground mb-1">{p.startDate} - {p.endDate || "Present"}</p>}
              {p.entity && <p className="text-xs text-muted-foreground mb-1"><EditableText path={`projects.${idx}.entity`}>{p.entity}</EditableText></p>}
              {p.description && (
                <p className="text-sm mb-2">
                  <AnnotatedText path={`projects.${idx}.description`}>{p.description}</AnnotatedText>
                </p>
              )}
              {p.highlights && p.highlights.length > 0 && (
                <ul className="list-disc list-inside text-sm mb-2 space-y-1">
                  {p.highlights.map((h, hi) => (
                    <li key={hi}>
                      <AnnotatedText path={`projects.${idx}.highlights.${hi}`}>{h}</AnnotatedText>
                    </li>
                  ))}
                </ul>
              )}
              {p.keywords && p.keywords.length > 0 && <Chips words={p.keywords} theme={theme} />}
              <ItemSkillBadges itemId={p.id} content={data} />
              {section.showMedia && <ItemMediaStrip itemId={p.id} metaData={data.metaData} variant="tiles" />}
            </AnnotatedBlock>
          ))}
        </div>
      );
    }
    case "awards": {
      const items = data.awards ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-3">
          {items.map((a, idx) => (
            <AnnotatedBlock key={idx} path={`awards.${idx}`} itemId={a.id} className="border-b pb-3 last:border-b-0 last:pb-0">
              <h3 className="font-semibold"><EditableText path={`awards.${idx}.title`}>{a.title}</EditableText></h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
                {a.awarder && <span><EditableText path={`awards.${idx}.awarder`}>{a.awarder}</EditableText></span>}
                {a.date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.date}</span>}
              </div>
              {a.summary && <p className="text-sm"><EditableText path={`awards.${idx}.summary`}>{a.summary}</EditableText></p>}
            </AnnotatedBlock>
          ))}
        </div>
      );
    }
    case "certificates": {
      const items = data.certificates ?? [];
      if (items.length === 0) return null;
      return (
        <ul className="space-y-2 text-sm">
          {items.map((c, idx) => (
            <li key={idx} className="flex justify-between gap-4" {...(c.id ? { [RESUME_ITEM_ID_ATTR]: c.id } : {})}>
              <div>
                <AnnotatedText path={`certificates.${idx}`}>
                  <span className="font-semibold"><EditableText path={`certificates.${idx}.name`}>{c.name}</EditableText></span>
                </AnnotatedText>
                {c.issuer && <span className="text-muted-foreground"> · <EditableText path={`certificates.${idx}.issuer`}>{c.issuer}</EditableText></span>}
              </div>
              {c.date && <span className="text-xs text-muted-foreground whitespace-nowrap">{c.date}</span>}
            </li>
          ))}
        </ul>
      );
    }
    case "publications": {
      const items = data.publications ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-3 text-sm">
          {items.map((p, idx) => (
            <AnnotatedBlock key={idx} path={`publications.${idx}`} itemId={p.id} className="border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex justify-between gap-4">
                <span className="font-semibold"><EditableText path={`publications.${idx}.name`}>{p.name}</EditableText></span>
                {p.releaseDate && <span className="text-xs text-muted-foreground whitespace-nowrap">{p.releaseDate}</span>}
              </div>
              {p.publisher && <p className="text-xs text-muted-foreground"><EditableText path={`publications.${idx}.publisher`}>{p.publisher}</EditableText></p>}
              {p.summary && <p className="mt-1"><EditableText path={`publications.${idx}.summary`}>{p.summary}</EditableText></p>}
            </AnnotatedBlock>
          ))}
        </div>
      );
    }
    case "interests": {
      const items = data.interests ?? [];
      if (items.length === 0) return null;
      if (layout === "grid") {
        return (
          <div className={`grid gap-3 ${gridColsClass(section.columns)}`}>
            {items.map((i, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <h3 className="font-semibold mb-1">
                  <AnnotatedText path={`interests.${idx}`}><EditableText path={`interests.${idx}.name`}>{i.name}</EditableText></AnnotatedText>
                </h3>
                {i.keywords && i.keywords.length > 0 && <Chips words={i.keywords} theme={theme} />}
              </div>
            ))}
          </div>
        );
      }
      return (
        <ul className="text-sm space-y-1">
          {items.map((i, idx) => (
            <li key={idx}>
              <AnnotatedText path={`interests.${idx}`}>
                <span className="font-semibold"><EditableText path={`interests.${idx}.name`}>{i.name}</EditableText></span>
              </AnnotatedText>
              {i.keywords && i.keywords.length > 0 && <span className="text-muted-foreground"> — {i.keywords.join(", ")}</span>}
            </li>
          ))}
        </ul>
      );
    }
    case "references": {
      const items = data.references ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-3 text-sm">
          {items.map((r, idx) => (
            <AnnotatedBlock key={idx} path={`references.${idx}`} className="border-b pb-3 last:border-b-0 last:pb-0">
              <div className="font-semibold"><EditableText path={`references.${idx}.name`}>{r.name}</EditableText></div>
              {r.reference && <p className="text-muted-foreground"><EditableText path={`references.${idx}.reference`}>{r.reference}</EditableText></p>}
            </AnnotatedBlock>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}
