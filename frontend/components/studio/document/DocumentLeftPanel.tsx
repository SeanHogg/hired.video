/**
 * DocumentLeftPanel — the document canvas's LEFT rail (where the scenes rail
 * sits for video). Replaces the on-canvas toolbar: design Templates at the
 * top, then the full block/section palette as draggable chips (drag onto the
 * page to insert, or click to append), then page size + orientation (resume).
 * Pure controller over `DocumentState` via the host's history-aware
 * `setState`/`commit`.
 */
import { Check, GripVertical, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  type DocumentState,
  documentSupportsPageMode,
  PAGE_SIZES,
  type PageSize,
} from "@/lib/studio/editor-v2/document-state";
import {
  addBlock,
  blockPresetsForEntity,
  firstPageId,
  newId,
  setOrientation,
  setPageSize,
} from "@/lib/studio/editor-v2/document-edit";
import {
  applyDocumentTemplate,
  documentTemplatesForEntity,
} from "@/lib/studio/editor-v2/document-templates";
import DocumentTemplatePicker from "@/components/studio/document/DocumentTemplatePicker";

/** dataTransfer MIME for a dragged palette preset — the value is the preset's
 *  index within `blockPresetsForEntity(entityKind)`. `DocumentStage` reads it
 *  on drop. Shared here so palette + canvas agree on the protocol. */
export const DOCUMENT_BLOCK_DRAG_MIME = "application/x-document-block-preset";

interface DocumentLeftPanelProps {
  state: DocumentState;
  setState: (updater: (prev: DocumentState) => DocumentState) => void;
  commit: () => void;
}

export default function DocumentLeftPanel({ state, setState, commit }: DocumentLeftPanelProps) {
  const { t } = useTranslation();
  const pageId = firstPageId(state);
  const presets = blockPresetsForEntity(state.entityKind);
  const canSetPageMode = documentSupportsPageMode(state.entityKind);
  // Section keys already placed on the page — drives the "in use" indicator so
  // the palette shows which sections the resume already contains. Free-content
  // primitives (text/image/divider/spacer) carry no sectionKey and can repeat,
  // so they're never marked.
  const usedSectionKeys = new Set(
    (state.pages[0]?.blocks ?? [])
      .filter((b) => b.mode === "flow" && b.sectionKey)
      .map((b) => b.sectionKey as string),
  );
  const activeTemplate = state.templateId
    ? documentTemplatesForEntity(state.entityKind).find((o) => o.id === state.templateId)
    : undefined;
  const commitState = (next: DocumentState) => {
    setState(() => next);
    commit();
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">
      {/* Templates */}
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <LayoutTemplate className="h-3.5 w-3.5" /> Templates
        </h3>
        <DocumentTemplatePicker
          entityKind={state.entityKind}
          currentTemplateId={state.templateId}
          onApply={(option) =>
            commitState(applyDocumentTemplate(state, option, () => newId("blk")))
          }
        />
        {/* Surface which template is applied so the choice is visible after the
            picker closes. */}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {activeTemplate ? (
            <>Using <span className="font-medium text-foreground">{activeTemplate.name}</span></>
          ) : (
            "Custom layout"
          )}
        </p>
      </section>

      {/* Block / section palette — drag onto the page, or click to append. */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sections
        </h3>
        <div className="flex flex-col gap-1.5">
          {presets.map((preset, i) => {
            const inUse = preset.sectionKey
              ? usedSectionKeys.has(preset.sectionKey)
              : false;
            return (
              <button
                key={preset.label}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DOCUMENT_BLOCK_DRAG_MIME, String(i));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => commitState(addBlock(state, pageId, preset).state)}
                className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm transition hover:border-brand-purple hover:bg-accent active:cursor-grabbing"
                title="Drag onto the page or click to add"
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{preset.label}</span>
                {inUse && (
                  <span
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-purple/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-purple"
                    title={t("studio.document.sectionInUse")}
                  >
                    <Check className="h-3 w-3" />
                    {t("studio.document.sectionInUse")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Page setup — resume only (others are locked Letter portrait). */}
      {canSetPageMode && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Page
          </h3>
          <div className="flex flex-col gap-2">
            <select
              value={state.pageSize}
              onChange={(e) => commitState(setPageSize(state, e.target.value as PageSize))}
              aria-label="Page size"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
            <div className="flex items-center rounded-md border border-border">
              <Button
                size="sm"
                variant={state.orientation === "portrait" ? "default" : "ghost"}
                className="flex-1 rounded-r-none"
                onClick={() => commitState(setOrientation(state, "portrait"))}
              >
                Portrait
              </Button>
              <Button
                size="sm"
                variant={state.orientation === "landscape" ? "default" : "ghost"}
                className="flex-1 rounded-l-none"
                onClick={() => commitState(setOrientation(state, "landscape"))}
              >
                Landscape
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
