import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

import { useProfileSectionVisibility } from "./profile-sections-context";

interface MasterResumeSectionProps {
  masterResume: any;
  descriptor: ResumeTemplateDescriptor;
  isOwner: boolean;
  onEditSection?: (section: string) => void;
}

export default function MasterResumeSection({
  masterResume,
  descriptor,
  isOwner,
  onEditSection,
}: MasterResumeSectionProps) {
  const visible = useProfileSectionVisibility("masterResume");
  if (!visible) return null;

  if (masterResume) {
    return (
      <div className="-mx-4 md:-mx-6 [&_.max-w-6xl]:max-w-none">
        <DeclarativeResumeRenderer
          resume={masterResume}
          descriptor={descriptor}
          embedded
          isOwner={isOwner}
          onEditSection={onEditSection}
        />
      </div>
    );
  }

  return <NoResumeCard isOwner={isOwner} />;
}

function NoResumeCard({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-card text-card-foreground p-10 text-center">
      <h3 className="font-semibold text-lg mb-2">
        {isOwner ? t("messages.noMasterResumeFound") : t("messages.professionalDetailsPrivate")}
      </h3>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
        {isOwner ? t("messages.noMasterResumeOwnerCta") : t("messages.noMasterResumeVisitor")}
      </p>
      {isOwner && (
        <Button asChild>
          <Link to="/resumes">{t("actions.manageResumes")}</Link>
        </Button>
      )}
    </div>
  );
}
