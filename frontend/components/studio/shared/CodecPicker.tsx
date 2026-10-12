/**
 * CodecPicker — export-codec selector shared by v1's StudioSettings +
 * v2's right-panel inspector (Canvas → Export section). Self-gates the
 * Pro badge via useSubscription, no prop-drilled `canExportProres` flag.
 *
 * Catalog lives in `lib/studio/codec-presets.ts` (single source of
 * truth). Parent decides what to do with the picked preset (v1 writes
 * `{ codec, container, audioCodec }` triple; v2 writes the same triple
 * to CanvasState).
 */
import { useTranslation } from "react-i18next";
import { CODEC_PRESETS, type Codec, type CodecPreset } from "@/lib/studio/codec-presets";
import { useSubscription } from "@/lib/hooks/useSubscription";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface CodecPickerProps {
  activeCodecId: CodecPreset["id"] | null;
  onSelect: (preset: CodecPreset) => void;
  /** Limit the list (e.g. to the codecs a surface can render); default all. */
  codecs?: readonly Codec[];
  className?: string;
}

export default function CodecPicker({
  activeCodecId,
  onSelect,
  codecs,
  className,
}: CodecPickerProps) {
  const { t } = useTranslation();
  const { isPro } = useSubscription();
  const presets = codecs ? CODEC_PRESETS.filter((c) => codecs.includes(c.id)) : CODEC_PRESETS;
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{t("studio.picker.codec")}</Label>
      <Select
        value={activeCodecId ?? "h264"}
        onValueChange={(value) => {
          const preset = presets.find((c) => c.id === value);
          if (preset) onSelect(preset);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => {
            const locked = preset.proOnly && !isPro;
            return (
              <SelectItem
                key={preset.id}
                value={preset.id}
                disabled={locked}
              >
                {t(preset.labelKey)}
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {t(preset.hintKey)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {t("studio.picker.codecHelp")}
      </p>
    </div>
  );
}
