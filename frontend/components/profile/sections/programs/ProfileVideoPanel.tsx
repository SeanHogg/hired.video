// Public-profile Video tab — surfaces the creator's promo-video output:
//   • Public studio videos (poster + lazy player)
//   • Public studio templates (purchasable presets the creator authored)
//
// Both fetch in parallel; the tab renders empty state only when both
// lists are empty so a video-only or template-only creator still shows
// what they have.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Video as VideoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import { studioService, type UserVideo } from "@/lib/services/studio-service";
import EmptyProgramState from "./EmptyProgramState";

interface Props {
  userId: string;
  isOwner: boolean;
}

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function ProfileVideoPanel({ userId, isOwner }: Props) {
  const [videos, setVideos] = useState<UserVideo[]>([]);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      studioService.getVideosForUser(userId).then((r) => r.data ?? []).catch(() => []),
      studioTemplatesService.listPublicByCreator(userId).catch(() => []),
    ]).then(([v, t]) => {
      if (cancelled) return;
      setVideos(v);
      setTemplates(t);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading videos…
        </CardContent>
      </Card>
    );
  }

  if (videos.length === 0 && templates.length === 0) {
    return <EmptyProgramState program="video" isOwner={isOwner} />;
  }

  return (
    <div className="space-y-6">
      {videos.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Videos
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {videos.map((v) => (
              <StudioVideoSurface
                key={v.id}
                mode="lazy"
                videoId={v.id}
                poster={v.thumbnailUrl ?? null}
                title={v.title ?? "Video"}
              />
            ))}
          </div>
        </section>
      )}

      {templates.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Templates
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map((tpl) => (
              <TemplateRow key={tpl.id} template={tpl} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TemplateRow({ template }: { template: StudioTemplate }) {
  const href = template.listingSlug
    ? `/marketplace/templates/${encodeURIComponent(template.listingSlug)}`
    : `/marketplace/templates/${template.id}`;
  return (
    <Link
      to={href}
      className="block rounded-lg border bg-card hover:bg-accent/5 transition-colors overflow-hidden"
    >
      {template.thumbnailUrl ? (
        <div className="aspect-video bg-muted">
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <VideoIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <h3 className="font-semibold leading-tight line-clamp-2">{template.name}</h3>
        {template.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
        )}
        <div className="flex items-center justify-between text-sm pt-1">
          <span className="font-semibold">{formatPrice(template.priceCents, template.currency)}</span>
          {template.firstParty && (
            <Badge variant="secondary" className="text-[10px]">First-party</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
