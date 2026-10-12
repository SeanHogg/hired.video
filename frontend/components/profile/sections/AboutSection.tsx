import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";
import { useProfileSectionVisibility } from "./profile-sections-context";

interface AboutSectionProps {
  bio?: string;
  isOwner: boolean;
  onEdit?: () => void;
  /** Open the Edit About dialog AND auto-kick the AI rewrite of the bio. */
  onImproveWithAI?: () => void;
}

export default function AboutSection({ bio, isOwner, onEdit, onImproveWithAI }: AboutSectionProps) {
  const { t } = useTranslation();
  const sectionVisible = useProfileSectionVisibility("about");
  if (!sectionVisible) return null;
  if (!bio && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>{t("headings.about")}</CardTitle>
        {isOwner && (onEdit || onImproveWithAI) && (
          <div className="flex items-center gap-1">
            {onImproveWithAI && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onImproveWithAI}
                aria-label={t("actions.improveWithAi")}
                title={t("actions.improveWithAi")}
                className="h-8 w-8 text-muted-foreground hover:text-primary"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
            {onEdit && <SectionEditButton onClick={onEdit} label={t("actions.editAbout")} />}
          </div>
        )}
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
