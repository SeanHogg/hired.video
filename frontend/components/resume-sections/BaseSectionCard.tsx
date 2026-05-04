import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { CollapseAllToggle, CollapseProvider } from "./CollapseContext";

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
  // Provider wraps the whole card so the header's CollapseAllToggle and
  // each BaseSectionItem in `children` share the same registry.
  return (
    <CollapseProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <div className="flex items-center gap-2">
            {/* Self-gates: renders only when 2+ items have registered an id. */}
            <CollapseAllToggle />
            <Button onClick={onAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {addButtonText}
            </Button>
          </div>
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
    </CollapseProvider>
  );
}
