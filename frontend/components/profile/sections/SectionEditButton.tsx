import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface SectionEditButtonProps {
  onClick: () => void;
  label?: string;
}

export default function SectionEditButton({ onClick, label }: SectionEditButtonProps) {
  const { t } = useTranslation();
  const accessibleLabel = label ?? t("actions.edit");
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label={accessibleLabel}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
