/**
 * useResumeInsights — derive insights + template ranking from the draft, and
 * own the visitor's structure / template / style picks (the style is the
 * look set by hand over the template: font, size, spacing, colour, page —
 * resume-style.ts).
 *
 * The picks default ONCE per draft (`draftKey`), so chat revisions and
 * section edits never reset what the visitor chose:
 *   - a NEW résumé (a parse / description) takes the recommendation, and that
 *     design is what gets saved;
 *   - an EXISTING résumé keeps its saved design (resume-design.ts — including
 *     a legacy studio layout) and renders exactly as /resumes/:id does, until
 *     the visitor picks a structure or template here; only then is a new
 *     design written (`design` stays null until that point).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import { RESUME_TEMPLATE_LISTINGS } from "@shared/marketplace-template-listings";
import {
  analyzeResume,
  rankTemplates,
  type ResumeInsights,
  type ResumeStructure,
} from "@shared/resume-insights";
import { DEFAULT_DESCRIPTOR } from "@/types/resume-template";
import {
  designDescriptor,
  resolveResumeDescriptor,
  savedLayout,
  savedStructure,
  savedStyle,
  savedTemplateId,
  type ResumeDesign,
} from "@/lib/resume-design";
import { compactStyle, type ResumeStyle } from "./resume-style";

export const SUGGESTED_TEMPLATE_COUNT = 3;

/** The template row: the suggestions, always including the one applied
 *  (e.g. an existing résumé's saved template) so the selection is visible. */
export function templateChoices(suggested: readonly string[], selected: string): string[] {
  if (suggested.includes(selected)) return [...suggested];
  return [selected, ...suggested.slice(0, Math.max(0, suggested.length - 1))];
}

export function useResumeInsights(content: ResumeContent | null, draftKey: unknown, existing: boolean) {
  const insights: ResumeInsights | null = useMemo(
    () => (content ? analyzeResume(content) : null),
    [content],
  );
  const ranked = useMemo(
    () => (insights ? rankTemplates(insights, RESUME_TEMPLATE_LISTINGS) : []),
    [insights],
  );

  const [structure, setStructureState] = useState<ResumeStructure | null>("chronological");
  const [templateId, setTemplateIdState] = useState<string>(DEFAULT_DESCRIPTOR.id);
  const [style, setStyleState] = useState<ResumeStyle>({});
  // Whether the visitor picked a design for THIS draft (always true for a new
  // résumé, whose recommended design is the one to save).
  const [picked, setPicked] = useState(false);

  const defaultedFor = useRef<unknown>(undefined);
  useEffect(() => {
    if (!insights || defaultedFor.current === draftKey) return;
    defaultedFor.current = draftKey;
    setStyleState(savedStyle(content));
    if (existing) {
      setStructureState(savedStructure(content));
      setTemplateIdState(savedTemplateId(content) ?? DEFAULT_DESCRIPTOR.id);
      setPicked(false);
    } else {
      setStructureState(insights.recommendedStructure);
      setTemplateIdState(ranked[0] ?? DEFAULT_DESCRIPTOR.id);
      setPicked(true);
    }
  }, [insights, ranked, draftKey, content, existing]);

  const setStructure = useCallback((next: ResumeStructure) => {
    setStructureState(next);
    setPicked(true);
  }, []);
  const setTemplateId = useCallback((next: string) => {
    setTemplateIdState(next);
    setPicked(true);
  }, []);
  /** Render the résumé's OWN stored design (e.g. a studio layout it was
   *  just given by a résumé template) instead of a picked one. */
  const keepSavedDesign = useCallback(() => setPicked(false), []);
  /** Lays `patch` over the look (undefined fields go back to the template's). */
  const setStyle = useCallback((patch: Partial<ResumeStyle>) => {
    setStyleState((current) => compactStyle({ ...current, ...patch }));
    setPicked(true);
  }, []);

  /** The design to SAVE — null while an existing résumé keeps its own. */
  const design: ResumeDesign | null = useMemo(
    () => (picked ? { templateId, structure, style } : null),
    [picked, templateId, structure, style],
  );

  const descriptor = useMemo(
    () => (design ? designDescriptor(content, design) : resolveResumeDescriptor(content)),
    [design, content],
  );

  return {
    insights,
    suggestedTemplates: ranked.slice(0, SUGGESTED_TEMPLATE_COUNT),
    structure,
    setStructure,
    templateId,
    setTemplateId,
    keepSavedDesign,
    style,
    setStyle,
    design,
    descriptor,
    /** An existing résumé still showing its own (possibly studio-made) design. */
    usingSavedDesign: design === null && content !== null,
    /** …and that design is a legacy studio page layout. */
    hasStudioLayout: savedLayout(content) !== null,
  };
}
