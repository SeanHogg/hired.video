import { Linkedin, Github, Twitter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";

interface SocialProfilesSectionProps {
  linkedIn?: string;
  github?: string;
  twitter?: string;
  isOwner: boolean;
  onEdit?: () => void;
}

export default function SocialProfilesSection({
  linkedIn,
  github,
  twitter,
  isOwner,
  onEdit,
}: SocialProfilesSectionProps) {
  const { t } = useTranslation();
  const hasAny = linkedIn || github || twitter;
  if (!hasAny && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{t("headings.socialProfiles")}</CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label={t("actions.editSocialProfiles")} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {linkedIn && (
          <div className="flex items-center gap-3">
            <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={linkedIn}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t("labels.linkedIn")}
            </a>
          </div>
        )}
        {github && (
          <div className="flex items-center gap-3">
            <Github className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t("labels.github")}
            </a>
          </div>
        )}
        {twitter && (
          <div className="flex items-center gap-3">
            <Twitter className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t("labels.twitter")}
            </a>
          </div>
        )}
        {!hasAny && isOwner && (
          <p className="text-sm text-muted-foreground italic">
            {t("messages.socialProfilesEmpty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
