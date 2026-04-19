import { FileText } from "lucide-react";
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
  const emptyState = {
    icon: <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No certificates added yet.",
    description: 'Click "Add Certificate" to get started.',
  };

  return (
    <BaseSectionCard
      title="Certificates"
      onAdd={onAdd}
      addButtonText="Add Certificate"
      isEmpty={certificates.length === 0}
      emptyState={emptyState}
    >
      {certificates.map((cert, index) => (
        <BaseSectionItem
          key={index}
          title={`Certificate ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Certificate Name</Label>
              <Input
                value={cert.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder="AWS Certified Solutions Architect"
              />
            </div>
            <div className="space-y-2">
              <Label>Issuer</Label>
              <Input
                value={cert.issuer}
                onChange={(e) => onUpdate(index, "issuer", e.target.value)}
                placeholder="Amazon Web Services"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date Issued</Label>
              <Input
                type="date"
                value={cert.date}
                onChange={(e) => onUpdate(index, "date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Certificate URL</Label>
              <Input
                value={cert.url}
                onChange={(e) => onUpdate(index, "url", e.target.value)}
                placeholder="https://aws.amazon.com/verification"
              />
            </div>
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
