/**
 * UrlPickerInput — the URL field + trailing picker icons used everywhere
 * an author can either type a URL or pick an existing asset/link.
 *
 * Surfaces today:
 *   - Studio inspector "Button URL" (entity link)
 *   - Studio inspector image/video Source (media picker + custom banner)
 *   - Project Details Sheet "Social card image URL" (media picker)
 *   - Resume MetadataModal media URL (Studio video picker)
 *
 * Per DRY: each picker self-encapsulates its own Dialog + trigger button —
 * this component is just the flex shell that lines them up to the right
 * of an Input. Pickers are passed as children so any combination
 * (Media, Content link, custom) can ride along without prop-drilling.
 *
 *   <UrlPickerInput value={url} onChange={setUrl} placeholder="https://…">
 *     <MediaIconPicker accept="image" onPick={setUrl} />
 *     <ContentLinkPicker onSelect={setUrl} />
 *   </UrlPickerInput>
 *
 * Optional inline preview:
 * Pass `previewKind="image"` or `previewKind="video"` to render a small
 * thumbnail below the input. The preview self-gates — it renders nothing
 * when the URL is empty, when the media fails to load, or when
 * `previewKind` is unset — so the consumer never needs a `canShow`
 * boolean. The Button URL surface omits the prop (the URL points at an
 * entity, not media, so previewing it would be meaningless).
 */
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type UrlPreviewKind = "image" | "video";

export interface UrlPickerInputProps
  extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (next: string) => void;
  /** Picker trigger nodes rendered to the right of the input. Each
   *  child encapsulates its own modal (e.g. MediaIconPicker,
   *  ContentLinkPicker, or a bespoke icon Button). */
  children?: ReactNode;
  /** Class on the flex container — not the input itself. */
  containerClassName?: string;
  /** When set, renders a small inline preview below the input. Image
   *  uses a 1200×630 aspect (social-card / hero shape); video uses 16:9.
   *  The preview hides itself on load error so a stale or external URL
   *  doesn't render a broken-image icon. */
  previewKind?: UrlPreviewKind;
  /** Class on the preview wrapper — lets a consumer override max-width. */
  previewClassName?: string;
}

export default function UrlPickerInput({
  value,
  onChange,
  children,
  containerClassName,
  placeholder = "https://…",
  className,
  previewKind,
  previewClassName,
  ...inputProps
}: UrlPickerInputProps) {
  return (
    <div className="space-y-1.5 min-w-0">
      <div
        className={cn(
          "flex items-center gap-1.5 min-w-0",
          containerClassName,
        )}
      >
        <Input
          {...inputProps}
          type="url"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn("min-w-0 flex-1", className)}
        />
        {children}
      </div>
      <UrlMediaPreview
        url={value}
        kind={previewKind}
        className={previewClassName}
      />
    </div>
  );
}

// Self-gated thumbnail — returns null when there's no kind, no URL, or
// the asset failed to load. Lives next to UrlPickerInput so every URL
// field can opt into a preview without duplicating the onError plumbing.
function UrlMediaPreview({
  url,
  kind,
  className,
}: {
  url: string;
  kind?: UrlPreviewKind;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [url, kind]);
  if (!kind || !url || errored) return null;
  const aspectRatio = kind === "image" ? "1200 / 630" : "16 / 9";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "block w-full max-w-xs overflow-hidden rounded-md border bg-muted",
        className,
      )}
      style={{ aspectRatio }}
    >
      {kind === "image" ? (
        <img
          src={url}
          alt="Preview"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <video
          src={url}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setErrored(true)}
        />
      )}
    </a>
  );
}
