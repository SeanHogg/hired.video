// StudioWizard.tsx — 3-step "create your first video" modal.
//
// Step 1: Pick a visual theme (template) + background preset/color
// Step 2: Pick the content template (Promote Yourself / Skills Demo / Job Ad / Personal Brand)
// Step 3: Fill in the corresponding inputs (reuses PromptEditor or SkillsDemoSetup) and Generate.

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PromptEditor from "@/components/PromptEditor";
import SkillsDemoSetup from "@/components/studio/SkillsDemoSetup";
import {
  TEMPLATES,
  BG_PRESETS,
  CONTENT_TEMPLATES,
  loadTemplate,
  type ContentTemplate,
} from "./StudioSidebar";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";

interface Props {
  open: boolean;
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  contentTemplate: ContentTemplate;
  onContentTemplateSelect: (t: ContentTemplate) => void;
  onTemplateLoad: (script: VideoScript) => void;
  onBackgroundSelect: (bgValue: string, customImageUrl?: string) => void;
  onGenerate: () => Promise<void> | void;
  onClose: () => void;
}

export default function StudioWizard({
  open,
  state,
  onStateChange,
  contentTemplate,
  onContentTemplateSelect,
  onTemplateLoad,
  onBackgroundSelect,
  onGenerate,
  onClose,
}: Props) {
  const [step, setStep] = useState(0);
  const [activeTemplateFile, setActiveTemplateFile] = useState<string | null>(null);
  const [activeBg, setActiveBg] = useState<string | null>(null);
  const [showJD, setShowJD] = useState(false);
  const [running, setRunning] = useState(false);

  if (!open) return null;

  const stepTitles = ["Theme & Style", "Content Template", "Your Details"];
  const isFirst = step === 0;
  const isLast = step === stepTitles.length - 1;

  async function handleTheme(file: string) {
    const script = await loadTemplate(file);
    if (script) {
      setActiveTemplateFile(file);
      onTemplateLoad(script);
    }
  }

  function handleBg(value: string) {
    setActiveBg(value);
    onBackgroundSelect(value);
  }

  // Per-step gating — Step 3 needs enough input to call generate
  const canGenerate =
    contentTemplate === "skills-demo"
      ? state.resumeText.trim().length > 0
      : state.resumeText.trim().length > 50;

  const canAdvance = step === 2 ? canGenerate : true;

  async function handleDone() {
    if (!canGenerate) return;
    setRunning(true);
    try {
      await onGenerate();
      onClose();
      setStep(0);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">New Video Wizard</h2>
            <span className="text-xs text-muted-foreground">
              · Step {step + 1} of {stepTitles.length}: {stepTitles[step]}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 px-5 py-3 border-b bg-muted/30">
          {stepTitles.map((t, i) => (
            <div key={t} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold transition-colors ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < stepTitles.length - 1 && (
                <div className={`w-8 h-px ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Visual Theme
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => {
                    const isActive = activeTemplateFile === t.file;
                    return (
                      <li key={t.file}>
                        <button
                          type="button"
                          onClick={() => handleTheme(t.file)}
                          className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-accent"
                          }`}
                        >
                          <div className="flex gap-1 mb-2">
                            {t.colors.map((c) => (
                              <div
                                key={c}
                                className="h-2 flex-1 rounded-sm"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between mb-0.5">
                            <span
                              className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}
                            >
                              {t.label}
                            </span>
                            {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {t.desc}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Background / Colors
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {BG_PRESETS.map((bg) => (
                    <button
                      key={bg.value}
                      type="button"
                      title={bg.label}
                      onClick={() => handleBg(bg.value)}
                      className={`relative h-14 rounded-md border-2 transition-all overflow-hidden ${
                        activeBg === bg.value
                          ? "border-primary ring-1 ring-primary"
                          : "border-transparent hover:border-primary/40"
                      }`}
                      style={{ background: bg.preview }}
                    >
                      {activeBg === bg.value && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Check className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Pick a starting look — you can fine-tune everything later from the sidebar.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                What kind of video?
              </p>
              <ul className="flex flex-col gap-2">
                {CONTENT_TEMPLATES.map((ct) => {
                  const isActive = contentTemplate === ct.id;
                  const Icon = ct.icon;
                  return (
                    <li key={ct.id}>
                      <button
                        type="button"
                        onClick={() => onContentTemplateSelect(ct.id)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors ${
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-accent"
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 shrink-0 ${
                            isActive ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm font-semibold ${
                              isActive ? "text-primary" : ""
                            }`}
                          >
                            {ct.label}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {ct.desc}
                          </p>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div>
              {contentTemplate === "skills-demo" ? (
                <SkillsDemoSetup state={state} onStateChange={onStateChange} />
              ) : (
                <PromptEditor
                  state={state}
                  onStateChange={onStateChange}
                  showJD={showJD}
                  onToggleJD={() => setShowJD((v) => !v)}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst || running}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          {!isLast ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(stepTitles.length - 1, s + 1))}
              disabled={!canAdvance}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleDone} disabled={!canGenerate || running}>
              {running ? (
                <>Generating…</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Done — Generate
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
