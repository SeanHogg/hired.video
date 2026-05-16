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
 */
import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
}

export default function UrlPickerInput({
  value,
  onChange,
  children,
  containerClassName,
  placeholder = "https://…",
  className,
  ...inputProps
}: UrlPickerInputProps) {
  return (
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
  );
}
