import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SectionEditButtonProps {
  onClick: () => void;
  label?: string;
}

export default function SectionEditButton({ onClick, label = "Edit" }: SectionEditButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label={label}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
