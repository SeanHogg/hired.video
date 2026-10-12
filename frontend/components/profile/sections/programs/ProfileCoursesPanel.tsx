// Public-profile Courses tab — every published course authored by this
// user. Reuses the marketplace card so cards look identical to the
// global `/search?category=courses` grid.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import { courseService, type PublicCourseCard } from "@/lib/services/course-service";
import EmptyProgramState from "./EmptyProgramState";

interface Props {
  userId: string;
  isOwner: boolean;
}

export default function ProfileCoursesPanel({ userId, isOwner }: Props) {
  const [items, setItems] = useState<PublicCourseCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    courseService
      .listPublishedByUser(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading courses…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return <EmptyProgramState program="courses" isOwner={isOwner} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((c) => (
        <CourseMarketplaceCard key={c.id} item={c as CourseMarketplaceItem} />
      ))}
    </div>
  );
}
