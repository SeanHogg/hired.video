import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface BaseSectionCardProps {
  title: string;
  onAdd: () => void;
  addButtonText: string;
  children: ReactNode;
  emptyState?: {
    icon: ReactNode;
    title: string;
    description: string;
  };
  isEmpty: boolean;
}

export default function BaseSectionCard({
  title,
  onAdd,
  addButtonText,
  children,
  emptyState,
  isEmpty,
}: BaseSectionCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {addButtonText}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEmpty && emptyState ? (
          <div className="text-center py-8 text-muted-foreground">
            {emptyState.icon}
            <p>{emptyState.title}</p>
            <p className="text-sm">{emptyState.description}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
