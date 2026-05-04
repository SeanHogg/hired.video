import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Certificate, SkillEvidence } from "@/types/resume";
import { mergeCertificates } from "@shared/skill-evidence";
import { MergeWidget, useMergeSelection } from "@/components/MergeWidget";
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

  const mergeWired = !!onReplaceCertificatesAndEvidence;
  const selection = useMergeSelection(certificates.length);

  const handleMergeConfirm = (primaryIndex: number) => {
    if (!onReplaceCertificatesAndEvidence) return;
    const merged = mergeCertificates({
      certificates,
      evidence: evidence ?? [],
      selectedIndexes: [...selection.selected],
      primaryIndex,
    });
    onReplaceCertificatesAndEvidence(merged.certificates, merged.evidence);
    selection.clear();
  };

  return (
    <BaseSectionCard
      title={t("tabs.certificates")}
      onAdd={onAdd}
      addButtonText={t("actions.addCertificate")}
      isEmpty={certificates.length === 0}
      emptyState={emptyState}
    >
      {mergeWired && (
        <MergeWidget
          noun="certificate"
          items={certificates}
          selectedIndexes={[...selection.selected]}
          onClear={selection.clear}
          onConfirm={handleMergeConfirm}
          renderLabel={(c: Certificate) => (
            <span>
              <strong>{c.name || "(unnamed)"}</strong>
              {c.issuer ? ` · ${c.issuer}` : ""}
              {c.date ? ` — ${c.date}` : ""}
            </span>
          )}
        />
      )}
      {mergeWired && certificates.length >= 2 && selection.selectedCount === 0 && (
        <p className="text-xs text-muted-foreground -mt-2 mb-2">
          Tip: tick two or more certificates to merge duplicates (e.g. the
          same credential listed twice with different issuer spellings).
        </p>
      )}
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
              {mergeWired && certificates.length >= 2 && (
                <Checkbox
                  checked={selection.isSelected(index)}
                  onCheckedChange={() => selection.toggle(index)}
                  aria-label={`Select certificate ${index + 1} for merge`}
                />
              )}
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
