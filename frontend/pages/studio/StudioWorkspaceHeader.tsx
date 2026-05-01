/**
 * StudioWorkspaceHeader — single source of truth for actions on the active
 * studio project. Replaces the legacy "title input + save button" row in the
 * sidebar AND the three-step bottom action bar (StudioActionBar).
 *
 * Layout:
 *   ┌─ Project Title (click to rename) ────── Render ↗ Share ⋯ ─┐
 *   │  Status · last saved indicator                 [ Save ]   │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Design rules:
 *   • Save is the ONLY primary CTA. It saves AND runs the full generate
 *     pipeline (script → video). Empty / too-short input is intercepted by
 *     the parent and routed back into the Prompt tab with a validation
 *     flash — this component only fires the click.
 *   • Render / Share / More are per-project icon actions. They light up
 *     once the underlying state is reachable (e.g. Share is disabled until
 *     a video exists).
 *   • The status label sits *under* the title so the eye reads
 *     "what is this thing → how is it doing → what can I do with it"
 *     top-to-bottom.
 */

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Save as SaveIcon,
  Share2,
  Sparkles,
  Store,
  Upload,
  UserCheck,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  exportProgress: number;
  isPublic: boolean;
  isPublishedToProfile: boolean;
  profileUrl?: string;
  /** Primary CTA — the parent decides whether to validate / save / generate. */
  onSave: () => void;
  /** Project title edits propagate up so the parent can persist on next save. */
  projectName: string;
  onProjectNameChange: (next: string) => void;
  /** Share-menu actions. */
  onPublish: () => void;
  onPublishToProfile: () => void;
  onLinkedInPublish: () => void;
  onMakePublic: (pub: boolean) => void;
  onDownloadLocal?: () => void;
  /** Render-options dropdown. */
  removeBranding?: boolean;
  onRemoveBrandingChange?: (next: boolean) => void;
  isPro?: boolean;
  /** "More" menu — publish-as-template moved out of the sidebar so all
   *  per-project actions live in one place. */
  onPublishAsTemplate?: () => void;
}

export default function StudioWorkspaceHeader({
  state,
  compiledVideo,
  exportProgress,
  isPublic,
  isPublishedToProfile,
  profileUrl,
  onSave,
  projectName,
  onProjectNameChange,
  onPublish,
  onPublishToProfile,
  onLinkedInPublish,
  onMakePublic,
  onDownloadLocal,
  removeBranding = false,
  onRemoveBrandingChange,
  isPro = false,
  onPublishAsTemplate,
}: Props) {
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  const hasVideo = state.videoBlob != null || state.videoUrl != null;
  const hasYoutube = state.youtubeVideoId != null;

  // Title editing — click the title to start, blur or Enter to commit.
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(projectName);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Keep the local draft in sync when the parent renames or loads a different project.
  useEffect(() => {
    if (!editingTitle) setDraftTitle(projectName);
  }, [projectName, editingTitle]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  function commitTitle() {
    const next = draftTitle.trim();
    if (next && next !== projectName) onProjectNameChange(next);
    else setDraftTitle(projectName);
    setEditingTitle(false);
  }

  // Status copy + dot colour. Saved/Ready is the resting state; the rest are
  // transient. Error is sticky until the next attempt.
  const statusLabel: Record<string, string> = {
    idle: "Draft",
    generating: "Generating script…",
    ready: hasVideo ? "Ready" : "Script ready",
    exporting: `Rendering video… ${Math.round(exportProgress * 100)}%`,
    uploading: "Uploading…",
    publishing: "Publishing…",
    done: "Published",
    error: "Something went wrong",
  };
  const dotClass: Record<string, string> = {
    idle: "bg-muted-foreground/40",
    generating: "bg-blue-500 animate-pulse",
    ready: "bg-emerald-500",
    exporting: "bg-blue-500 animate-pulse",
    uploading: "bg-blue-500 animate-pulse",
    publishing: "bg-amber-500 animate-pulse",
    done: "bg-emerald-500",
    error: "bg-red-500",
  };

  const saveLabel = busy
    ? state.status === "generating"
      ? "Generating…"
      : state.status === "exporting"
        ? "Rendering…"
        : state.status === "uploading"
          ? "Uploading…"
          : "Working…"
    : hasVideo
      ? "Save & Re-render"
      : state.script
        ? "Save & Render"
        : "Save & Generate";

  return (
    <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b bg-background">
      {/* Title + status — left-aligned column */}
      <div className="flex flex-col min-w-0 flex-1">
        {editingTitle ? (
          <Input
            ref={titleInputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setDraftTitle(projectName);
                setEditingTitle(false);
              }
            }}
            className="h-7 text-sm font-semibold px-2"
            placeholder="Untitled video"
            maxLength={120}
          />
        ) : (
          <button
            type="button"
            className="text-left text-sm font-semibold truncate hover:text-primary transition-colors"
            onClick={() => setEditingTitle(true)}
            title="Click to rename"
          >
            {projectName || "Untitled video"}
          </button>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn("inline-block w-1.5 h-1.5 rounded-full", dotClass[state.status] ?? dotClass.idle)} />
          <span className="text-[11px] text-muted-foreground truncate">
            {statusLabel[state.status] ?? "Draft"}
          </span>
        </div>
      </div>

      {/* Per-project icon actions — order: render, share, more. */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Render options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              title="Render options"
              disabled={busy}
            >
              <Wand2 className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Render options
            </DropdownMenuLabel>
            <div
              className="px-2 py-1.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="hdr-remove-branding" className="text-xs leading-tight block">
                    Remove hired.video branding
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {isPro ? (
                      "Drops the intro card, outro card, and watermark."
                    ) : (
                      <>
                        Pro plan only —{" "}
                        <a href="/pricing" className="underline hover:text-primary">
                          upgrade
                        </a>{" "}
                        to remove the intro, outro, and watermark.
                      </>
                    )}
                  </p>
                </div>
                <Switch
                  id="hdr-remove-branding"
                  checked={isPro ? removeBranding : false}
                  disabled={!isPro}
                  onCheckedChange={(v) => onRemoveBrandingChange?.(v)}
                />
              </div>
            </div>
            {hasVideo && onDownloadLocal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDownloadLocal}>
                  <Download className="w-3.5 h-3.5 mr-2" /> Download local copy
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Share */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              title="Share"
              disabled={!hasVideo || busy}
            >
              <Share2 className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Publish
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={onPublish} disabled={!hasVideo || busy}>
              <Upload className="w-3.5 h-3.5 mr-2" />
              {hasYoutube ? "Re-publish to YouTube" : "Publish to YouTube"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLinkedInPublish} disabled={!hasVideo || busy}>
              <Share2 className="w-3.5 h-3.5 mr-2" /> Publish to LinkedIn
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPublishToProfile} disabled={!hasVideo || busy}>
              {isPublishedToProfile ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-2" /> Published to Profile
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 mr-2" /> Publish to Profile
                </>
              )}
            </DropdownMenuItem>
            {isPublishedToProfile && profileUrl && (
              <DropdownMenuItem asChild>
                <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" /> View Profile
                </a>
              </DropdownMenuItem>
            )}
            {hasVideo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Visibility
                </DropdownMenuLabel>
                <div
                  className="flex items-center justify-between px-2 py-1.5 text-xs"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="flex items-center gap-1.5">
                    {isPublic ? (
                      <Globe className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                    {isPublic ? "Public" : "Make public"}
                  </span>
                  <Switch checked={isPublic} onCheckedChange={onMakePublic} />
                </div>
                {isPublic && state.projectId && (
                  <div
                    className="flex items-center gap-1 px-2 pb-2"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      readOnly
                      className="h-6 text-[10px] flex-1 font-mono"
                      value={`https://hired.video/v/${state.projectId}`}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] shrink-0"
                      onClick={() =>
                        navigator.clipboard.writeText(`https://hired.video/v/${state.projectId}`)
                      }
                    >
                      Copy
                    </Button>
                  </div>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More — publish-as-template + future per-project actions */}
        {onPublishAsTemplate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                title="More actions"
                disabled={busy}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onPublishAsTemplate} disabled={!state.projectId || !state.script}>
                <Store className="w-3.5 h-3.5 mr-2" />
                Publish as Marketplace Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Save — primary CTA. Persists project + runs full generate pipeline. */}
        <Button
          size="sm"
          className="h-8 ml-1 gap-1.5"
          onClick={onSave}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : state.script ? (
            <SaveIcon className="w-3.5 h-3.5" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {saveLabel}
        </Button>
      </div>
    </header>
  );
}
