/**
 * On-frame retyping: a text field laid exactly over the selected text
 * widget's box on the kit video frame (positioned as % of the stage, so it
 * tracks any zoom), styled like the words it replaces. Each keystroke is sent
 * up (`onChange` — the host commits it with a coalescing undo group); Escape,
 * Enter-with-⌘/Ctrl or leaving the field closes it, and focus goes back to
 * where it was (the widget on the frame).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Widget } from "@/lib/studio/editor-v2/canvas-state";
import { widgetText } from "@/lib/build/frame-edits";

interface OnFrameTextEditorProps {
  widget: Widget;
  /** Stage scale (canvas px → screen px), so the type matches the frame. */
  zoom: number;
  maxLength: number;
  onChange: (text: string) => void;
  onClose: () => void;
}

/** The look of the words being replaced (text-bearing kinds only). */
function typeStyle(widget: Widget, zoom: number): CSSProperties {
  const { params } = widget;
  switch (params.kind) {
    case "text":
    case "heading":
      return {
        fontSize: params.data.fontPx * zoom,
        color: params.data.color,
        fontWeight: params.data.fontWeight === "bold" ? 700 : 400,
        textAlign: params.data.align,
      };
    case "speech-bubble":
    case "caption-box":
    case "sfx-burst":
      return { fontSize: params.data.fontPx * zoom, color: params.data.color, textAlign: "center" };
    default:
      return {};
  }
}

export default function OnFrameTextEditor({ widget, zoom, maxLength, onChange, onClose }: OnFrameTextEditorProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => widgetText(widget) ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Take focus with the words selected; give it back on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    ref.current?.select();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const { x, y, width, height, rotation } = widget.position;
  return (
    <textarea
      ref={ref}
      value={value}
      maxLength={maxLength}
      aria-label={t("build.frame.retype")}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        // Keep Delete / Backspace / Escape from reaching the frame's shortcuts.
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onClose();
        }
      }}
      onBlur={onClose}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute z-20 resize-none overflow-hidden rounded-sm border-0 bg-black/55 p-0 leading-tight shadow-[0_0_0_2px_#ffffff,0_0_0_4px_hsl(var(--primary))] outline-none"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${width * 100}%`,
        minHeight: `${height * 100}%`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        ...typeStyle(widget, zoom),
      }}
    />
  );
}
