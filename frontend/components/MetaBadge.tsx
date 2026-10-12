import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Image as ImageIcon, PlayCircle } from "lucide-react";
import type { ResumeSectionMeta } from "@/types/resume";
import { MetaType } from "@/types/resume";

export function MetaBadge({ meta }: { meta: ResumeSectionMeta }) {
  const [open, setOpen] = useState(false);

  const icon = (() => {
    switch (meta.metaType) {
      case MetaType.YouTube:
      case MetaType.VideoMP4:
      case MetaType.VideoWebM:
        return <PlayCircle className="h-4 w-4" />;
      case MetaType.Image:
        return <ImageIcon className="h-4 w-4" />;
      case MetaType.Hyperlink:
      default:
        return <ExternalLink className="h-4 w-4" />;
    }
  })();

  const label = meta.name || (meta.metaType === MetaType.Image ? "Image" : meta.metaType === MetaType.YouTube || meta.metaType === MetaType.VideoMP4 || meta.metaType === MetaType.VideoWebM ? "Video" : "Link");

  const isVideo = meta.metaType === MetaType.YouTube || meta.metaType === MetaType.VideoMP4 || meta.metaType === MetaType.VideoWebM;
  const isImage = meta.metaType === MetaType.Image;

  return (
    <>
      {/* Explicit text-foreground so the label stays readable when this
          badge is rendered inside a hero/gradient that has set a white
          inherited text color (otherwise the outline button's bg-background
          + inherited white text = invisible pill). */}
      <Button size="sm" variant="outline" className="gap-1 text-foreground" onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{meta.name || label}</DialogTitle>
            {meta.description && <DialogDescription>{meta.description}</DialogDescription>}
          </DialogHeader>
          {/* Content */}
          {isVideo && (
            <div className="aspect-video w-full">
              {meta.metaType === MetaType.YouTube ? (
                <iframe
                  width="100%"
                  height="100%"
                  src={toYouTubeEmbed(meta.url)}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video controls className="w-full h-full">
                  <source src={meta.url} />
                </video>
              )}
            </div>
          )}
          {isImage && (
            <div className="w-full">
              <img src={meta.url} alt={meta.name || "Image"} className="max-h-[70vh] w-auto mx-auto" />
            </div>
          )}
          {!isVideo && !isImage && (
            <div className="w-full">
              <a className="inline-flex items-center gap-2 text-primary underline" href={meta.url} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="h-4 w-4" />
                Open Link
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function toYouTubeEmbed(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      const parts = u.pathname.split("/");
      const idx = parts.indexOf("embed");
      if (idx >= 0 && parts[idx + 1]) return `https://www.youtube.com/embed/${parts[idx + 1]}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return url;
}

