// Loading + empty states shared by the Saved / Applications / Alerts tabs
// of the /jobs hub (previously copied three times inline).

import type { ComponentType, ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function HubListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface HubEmptyCardProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: ReactNode;
}

export function HubEmptyCard({ icon: Icon, title, description, action }: HubEmptyCardProps) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Icon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground mb-6">{description}</p>
        {action}
      </CardContent>
    </Card>
  );
}
