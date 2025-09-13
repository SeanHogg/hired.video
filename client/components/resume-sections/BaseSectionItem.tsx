import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface BaseSectionItemProps {
  title: string;
  onRemove: () => void;
  children: ReactNode;
}

export default function BaseSectionItem({
  title,
  onRemove,
  children,
}: BaseSectionItemProps) {
  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{title}</h4>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}
