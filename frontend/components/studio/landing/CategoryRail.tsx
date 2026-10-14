/**
 * Featured category rail on /studio — a heading + horizontal scroller of
 * built-in templates in one category. Self-gates: renders nothing when the
 * catalog has no templates in that category, so the host never branches on
 * `filmTemplates.length`. Comic / ads can reuse later; only film is mounted.
 */
import { useTranslation } from "react-i18next";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import {
  TEMPLATE_CATALOG,
  type TemplateCategory,
  type TemplateDef,
} from "@/lib/studio/templates/catalog";
import { useTemplateActions } from "@/lib/studio/landing/use-template-actions";
import type { CreateStudioDraft } from "@/lib/studio/landing/types";
import BuiltinTemplateCard from "./BuiltinTemplateCard";

export default function CategoryRail({
  category,
  headingKey,
  create,
  catalog = TEMPLATE_CATALOG,
}: {
  category: TemplateCategory;
  headingKey: string;
  create: CreateStudioDraft;
  /** Injectable so tests can prove the empty-catalog self-gate. */
  catalog?: readonly TemplateDef[];
}) {
  const { t } = useTranslation();
  const { openTemplate, previewTemplate } = useTemplateActions(create);
  const templates = catalog.filter((template) => template.category === category);
  if (templates.length === 0) return null;

  return (
    <section aria-label={t(headingKey)} className="mb-6">
      <h2 className="mb-3 font-display text-xl font-bold tracking-[-0.02em]">{t(headingKey)}</h2>
      <HorizontalScroller
        itemCount={templates.length}
        cellClassName="w-[72vw] max-w-[15rem] shrink-0 snap-start sm:w-60 sm:max-w-none"
      >
        {templates.map((template) => (
          <BuiltinTemplateCard
            key={template.id}
            template={template}
            onPick={openTemplate}
            onPreview={previewTemplate}
          />
        ))}
      </HorizontalScroller>
    </section>
  );
}
