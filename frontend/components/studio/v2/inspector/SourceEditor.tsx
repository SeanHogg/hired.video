/**
 * Source picker reused by both image and video widget Content sections.
 * Identical UX (MediaPicker trigger + free-form URL input), keyed off
 * `accept` to filter the picker. The image/video Content sections were
 * previously duplicating this block — extracted here per the DRY rule.
 */
import { Input } from "@/components/ui/input";
import MediaPicker from "@/components/shared/MediaPicker";

export interface SourceEditorProps {
  accept: "image" | "video";
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  onChange: (source: { kind: "url"; url: string }) => void;
}

export default function SourceEditor({ accept, source, onChange }: SourceEditorProps) {
  const url = source.kind === "url" ? source.url : "";
  const hasUrl = source.kind === "url" && source.url.length > 0;
  const noun = accept === "image" ? "image" : "video";
  return (
    <>
      <MediaPicker
        accept={accept}
        title={`Replace ${noun}`}
        triggerLabel={hasUrl ? `Replace ${noun}` : `Choose ${noun}`}
        onPick={(asset) => onChange({ kind: "url", url: asset.url })}
      />
      <Input
        value={url}
        placeholder="…or paste a URL"
        className="mt-2"
        onChange={(e) => onChange({ kind: "url", url: e.target.value })}
      />
    </>
  );
}
