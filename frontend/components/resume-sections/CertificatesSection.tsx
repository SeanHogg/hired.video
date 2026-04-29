import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Certificate } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface CertificatesSectionProps {
  certificates: Certificate[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Certificate, value: string) => void;
  onRemove: (index: number) => void;
}

export default function CertificatesSection({
  certificates,
  onAdd,
  onUpdate,
  onRemove,
}: CertificatesSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.certificates.title"),
    description: t("messages.empty.certificates.description"),
  };

  return (
    <BaseSectionCard
      title={t("tabs.certificates")}
      onAdd={onAdd}
      addButtonText={t("actions.addCertificate")}
      isEmpty={certificates.length === 0}
      emptyState={emptyState}
    >
      {certificates.map((cert, index) => (
        <BaseSectionItem
          key={index}
          title={t("labels.itemNumber.certificate", { index: index + 1 })}
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
      ))}
    </BaseSectionCard>
  );
}
