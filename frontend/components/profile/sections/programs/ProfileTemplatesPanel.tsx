// Public-profile Templates tab — lists every published Studio template
// authored by the profile owner. Self-fetching + self-gating; the parent
// only passes `userId` + `isOwner`. Mirrors ProfileArticlesPanel /
// ProfileCoursesPanel so the tab strip is consistent (#909).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import { buildImageUrl } from "@/lib/utils";
import EmptyProgramState from "./EmptyProgramState";

interface Props {
  userId: string;
  isOwner: boolean;
}

export default function ProfileTemplatesPanel({ userId, isOwner }: Props) {
  const [items, setItems] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    studioTemplatesService
      .listPublicByCreator(userId)
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
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading templates…
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyProgramState program="templates" isOwner={isOwner} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((t) => (
        <TemplateRow key={t.id} template={t} />
      ))}
    </div>
  );
}

function TemplateRow({ template }: { template: StudioTemplate }) {
  const price =
    template.priceCents > 0 ? `$${(template.priceCents / 100).toFixed(2)}` : "Free";
  // StudioTemplate exposes `listingSlug` (nullable) + `name` — there are no
  // `slug` / `title` fields. Fall back to the marketplace index when a
  // template has no public listing slug yet.
  const href = template.listingSlug
    ? `/search?category=templates&template=${template.listingSlug}`
    : `/search?category=templates`;
  return (
    <Link
      to={href}
      className="block rounded-lg border bg-card hover:bg-accent/5 transition-colors overflow-hidden"
    >
      {template.thumbnailUrl ? (
        <div className="aspect-video bg-muted">
          <img
            src={buildImageUrl(template.thumbnailUrl)}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs capitalize">
            {template.mediaKind}
          </Badge>
        </div>
        <h3 className="font-semibold leading-tight line-clamp-2">{template.name}</h3>
        <div className="text-xs text-muted-foreground pt-1">{price}</div>
      </div>
    </Link>
  );
}
