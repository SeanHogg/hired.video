import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";
import { useProfileSectionVisibility } from "./profile-sections-context";

interface AboutSectionProps {
  bio?: string;
  isOwner: boolean;
  onEdit?: () => void;
}

export default function AboutSection({ bio, isOwner, onEdit }: AboutSectionProps) {
  const { t } = useTranslation();
  const sectionVisible = useProfileSectionVisibility("about");
  if (!sectionVisible) return null;
  if (!bio && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>{t("headings.about")}</CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label={t("actions.editAbout")} />}
      </CardHeader>
      <CardContent>
        {bio ? (
          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
            {bio}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("messages.aboutPlaceholderEmpty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
