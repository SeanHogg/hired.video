/**
 * LinkedContentBody — canvas-side preview for the `linked-content`
 * widget. Self-fetches the entity's preview projection via the linked-
 * content registry and renders a generic card (title / subtitle / body /
 * chips / CTA). One body component serves every entity kind — per-kind
 * semantics live in `LINKED_CONTENT_REGISTRY[entityKind].fetchPreview`.
 *
 * Empty state: when `entityId` is "" the widget renders a prompt to
 * pick an entity from the inspector. This happens only for widgets
 * authored before binding (e.g. created via the legacy
 * `defaultWidget("linked-content")` path) — palette + drag-drop tiles
 * bind the entity at creation time so the empty state shouldn't appear
 * during normal use.
 *
 * Mode contract matches the rest of `CanvasStage`'s widget bodies:
 *   - `edit`    — CTA renders as an inert chip so clicks select the
 *                 widget for inspector editing.
 *   - `preview` — CTA is a live `<a target="_blank">` opening the
 *                 entity's canonical route.
 */
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  getLinkedContentMeta,
  type LinkedContentPreview,
} from "@/lib/studio/editor-v2/linked-content";
import type { LinkedContentWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import type { CanvasStageMode } from "./CanvasStage";

interface LinkedContentBodyProps {
  data: LinkedContentWidgetParams;
  mode: CanvasStageMode;
  onCtaActivate?: (url: string) => void;
}

export default function LinkedContentBody({
  data,
  mode,
  onCtaActivate,
}: LinkedContentBodyProps) {
  const meta = getLinkedContentMeta(data.entityKind);
  const Icon = meta.icon;
  const [preview, setPreview] = useState<LinkedContentPreview | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!data.entityId) {
      setPreview(null);
      setLoadState("idle");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    meta
      .fetchPreview(data.entityId)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setLoadState(p ? "idle" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [data.entityId, meta]);

  if (!data.entityId) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message={`Pick a ${meta.label.toLowerCase()} from the inspector`}
      />
    );
  }

  if (loadState === "loading" && !preview) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message={`Loading ${meta.label.toLowerCase()}…`}
      />
    );
  }

  if (!preview) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message={`Couldn't load this ${meta.label.toLowerCase()}.`}
      />
    );
  }

  const isPreview = mode === "preview";
  const viewUrl = meta.viewUrl(preview.id);

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-md bg-white p-4 text-slate-900 shadow-sm ring-1 ring-slate-200">
      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold leading-tight">
            {preview.title}
          </div>
          {preview.subtitle && (
            <div className="truncate text-xs text-slate-500">
              {preview.subtitle}
            </div>
          )}
        </div>
      </header>

      {preview.body && (
        <p className="line-clamp-4 text-sm leading-snug text-slate-700">
          {preview.body}
        </p>
      )}

      {preview.chips && preview.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preview.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2">
        {isPreview ? (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onCtaActivate?.(viewUrl)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {meta.ctaLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
            {meta.ctaLabel}
            <ExternalLink className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  Icon,
  label,
  message,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  message: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md bg-white/95 p-4 text-center text-slate-500 ring-1 ring-dashed ring-slate-300">
      <Icon className="h-6 w-6 text-slate-400" />
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="text-[11px] leading-tight">{message}</div>
    </div>
  );
}
