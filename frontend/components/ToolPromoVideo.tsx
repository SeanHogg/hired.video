// Shared promo-video affordance for any tool surface (cards, detail pages,
// dashboards). Self-gating: returns null when the tool has no
// promoVideoUrl, so consumers don't need to write `if (tool.promoVideoUrl)`
// anywhere — they just drop <ToolPromoVideo tool={tool} /> in.
//
// Two display modes:
//  - "thumb"  (default) — compact "Watch demo" pill, opens a Dialog with
//    the player. Right for cards.
//  - "inline" — renders the player directly. Right for tool detail pages.
//
// To produce a promo video, use the "Tool Promo" Studio template
// (frontend/components/studio/templates/intake/ToolPromoIntake.tsx). The
// resulting public video URL goes in the catalog entry's `promoVideoUrl`.

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ToolCatalogEntry } from "@/data/tools-catalog";

interface Props {
  tool: ToolCatalogEntry;
  variant?: "thumb" | "inline";
  className?: string;
}

export function ToolPromoVideo({ tool, variant = "thumb", className }: Props) {
  const [open, setOpen] = useState(false);
  const url = tool.promoVideoUrl;
  if (!url) return null;

  if (variant === "inline") {
    return (
      <div className={cn("aspect-video w-full rounded-lg overflow-hidden bg-black", className)}>
        <PromoPlayer url={url} title={`${tool.title} — demo`} />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("gap-1.5 text-xs", className)}
          onClick={(e) => {
            // Stop the parent <Link> from also navigating when this lives
            // inside <ToolCard>.
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          Watch demo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tool.title} — demo</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
          <PromoPlayer url={url} title={`${tool.title} — demo`} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Renders a YouTube embed for youtube.com / youtu.be links, otherwise a
// plain <video> tag. Keeps the integration simple — Mux / Vimeo can be
// added here when a tool actually needs them.
function PromoPlayer({ url, title }: { url: string; title: string }) {
  const yt = parseYouTubeId(url);
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
      />
    );
  }
  return (
    <video
      src={url}
      controls
      playsInline
      className="w-full h-full object-contain"
    />
  );
}

function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.slice(7);
    }
    return null;
  } catch {
    return null;
  }
}
