// TemplateKindChip — the mono chip saying what a template makes ("Video",
// "Résumé", "Article"…). Label from the shared `templateKindLabelKey`
// (@shared/template-kinds), so every template surface — the search /
// marketplace card, the Resource Map tiles — names kinds identically.

import { useTranslation } from "react-i18next";
import MonoChip from "@/components/templates/MonoChip";
import { templateKindLabelKey } from "@shared/template-kinds";

interface Props {
  mediaKind: string | null | undefined;
  documentKind?: string | null;
  className?: string;
}

export default function TemplateKindChip({ mediaKind, documentKind, className }: Props) {
  const { t } = useTranslation();
  return <MonoChip className={className}>{t(templateKindLabelKey(mediaKind, documentKind))}</MonoChip>;
}
