import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Certificate, SkillEvidence } from "@/types/resume";
import { mergeCertificates } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface CertificatesSectionProps {
  certificates: Certificate[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Certificate, value: string) => void;
  onRemove: (index: number) => void;
  /** When provided, the section enables multi-select + Merge UI. The
   *  callback receives the post-merge certificates + evidence arrays so
   *  the parent can update both atomically. Without it the merge controls
   *  don't render — the section self-gates instead of taking a prop-drilled
   *  `canMerge` boolean. */
  evidence?: SkillEvidence[];
  onReplaceCertificatesAndEvidence?: (
    nextCertificates: Certificate[],
    nextEvidence: SkillEvidence[],
  ) => void;
  onReorder?: (next: Certificate[]) => void;
}

export default function CertificatesSection({
  certificates,
  onAdd,
  onUpdate,
  onRemove,
  evidence,
  onReplaceCertificatesAndEvidence,
  onReorder,
}: CertificatesSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.certificates.title"),
    description: t("messages.empty.certificates.description"),
  };

  // Shared merge scaffolding — same hook every section uses.
  const merge = useSectionMerge<Certificate>({
    items: certificates,
    noun: "certificate",
    onReplace: onReplaceCertificatesAndEvidence,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplaceCertificatesAndEvidence) return;
      const result = mergeCertificates({
        certificates,
        evidence: evidence ?? [],
        selectedIndexes,
        primaryIndex,
      });
      onReplaceCertificatesAndEvidence(result.certificates, result.evidence);
    },
    renderLabel: (c) => (
      <span>
        <strong>{c.name || "(unnamed)"}</strong>
        {c.issuer ? ` · ${c.issuer}` : ""}
        {c.date ? ` — ${c.date}` : ""}
      </span>
    ),
    tipText:
      "Tip: tick two or more certificates to merge duplicates (e.g. the same credential listed twice with different issuer spellings).",
  });

  return (
    <BaseSectionCard
      title={t("tabs.certificates")}
      onAdd={onAdd}
      addButtonText={t("actions.addCertificate")}
      isEmpty={certificates.length === 0}
      emptyState={emptyState}
    >
      {merge.bar}
      {merge.tip}
      <SortableList
        items={certificates}
        getId={(c, i) => c.id ?? `cert-idx-${i}`}
        onReorder={onReorder}
      >
        {(cert, index) => (
        <BaseSectionItem
          key={cert.id ?? `cert-idx-${index}`}
          id={cert.id}
          collapsedSummary={
            cert.name || cert.issuer
              ? `${cert.name || ""}${cert.issuer ? ` · ${cert.issuer}` : ""}`.trim()
              : undefined
          }
          title={
            <span className="inline-flex items-center gap-2">
              {merge.checkbox(index)}
              {t("labels.itemNumber.certificate", { index: index + 1 })}
            </span>
          }
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.certificateName.label")}</Label>
              <Input
                value={cert.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder={t("fields.certificateName.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.issuer.label")}</Label>
              <Input
                value={cert.issuer}
                onChange={(e) => onUpdate(index, "issuer", e.target.value)}
                placeholder={t("fields.issuer.placeholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.dateIssued.label")}</Label>
              <Input
                type="date"
                value={cert.date}
                onChange={(e) => onUpdate(index, "date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.certificateUrl.label")}</Label>
              <Input
                value={cert.url}
                onChange={(e) => onUpdate(index, "url", e.target.value)}
                placeholder={t("fields.certificateUrl.placeholder")}
              />
            </div>
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
