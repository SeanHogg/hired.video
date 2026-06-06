import { Link } from "react-router-dom";
import { GraduationCap, Clock, Award, Users, Star, Share2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildShareAction } from "@/lib/card-share-action";
import { buildImageUrl } from "@/lib/utils";
import WishlistButton from "@/components/wishlist/WishlistButton";

export interface CourseMarketplaceItem {
  id: string;
  type: "course";
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags?: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  estimatedMinutes: number | null;
  priceCents: number | null;
  issuesCertificate: boolean;
  enrollmentCount: number;
  averageRating: number | null;
  ratingCount: number;
  publishedAt: string | null;
  author: { id: string; name: string; avatarUrl: string | null; slug: string };
}

function formatPrice(cents: number | null) {
  if (cents == null) return "Contact for pricing";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function CourseMarketplaceCard({ item }: { item: CourseMarketplaceItem }) {
  const href = `/courses/${item.author.slug}/${item.slug}`;
  const shareAction = buildShareAction({
    entityUrl: href,
    copySuccessDescription: "Course link has been copied to your clipboard.",
  });
  return (
    <BaseCard className="h-full flex flex-col">
      <div className="aspect-video bg-muted relative">
        {item.coverImageUrl ? (
          <img src={buildImageUrl(item.coverImageUrl)} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        {item.category && (
          <Badge className="absolute top-2 left-2 bg-background/90 text-foreground border">{item.category}</Badge>
        )}
        {item.issuesCertificate && (
          <Badge className="absolute top-2 right-2 bg-amber-500 text-white border-0">
            <Award className="h-3 w-3 mr-1" /> Cert
          </Badge>
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute bottom-2 right-2 h-7 w-7 bg-background/90 hover:bg-background"
          aria-label="Share course"
          onClick={(e) => shareAction.onClick(e)}
        >
          <Share2 className="h-3.5 w-3.5" />
        </Button>
        {/* Self-gating — renders nothing for signed-out viewers. */}
        <WishlistButton
          entityType="course"
          entityId={item.id}
          variant="outline"
          className="absolute bottom-2 left-2 h-7 w-7 bg-background/90 hover:bg-background"
        />
      </div>
      <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
        <h3 className="font-semibold leading-tight line-clamp-2">{item.title}</h3>
        {item.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">{item.summary}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.author.avatarUrl ? (
            <img src={item.author.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
              {(item.author.name ?? "?")[0]}
            </div>
          )}
          <span className="truncate">{item.author.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {item.difficulty && <span className="capitalize">{item.difficulty}</span>}
          {formatDuration(item.estimatedMinutes) && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuration(item.estimatedMinutes)}</span>
          )}
          {item.enrollmentCount > 0 && (
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {item.enrollmentCount}</span>
          )}
          {item.averageRating != null && item.averageRating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {Number(item.averageRating).toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-sm mt-auto pt-2 border-t">
          <span className="font-semibold">{formatPrice(item.priceCents)}</span>
        </div>
        <Button asChild size="sm" className="w-full">
          <Link to={href}>View course</Link>
        </Button>
      </CardContent>
    </BaseCard>
  );
}
