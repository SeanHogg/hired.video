/**
 * StudioFeaturesHub — advanced enhancements that layer onto the current video.
 *
 * Tabs:
 *   - Record (webcam + teleprompter)
 *   - Voiceover (TTS + voice cloning)
 *   - Captions (auto-caption editor)
 */

import { useState, lazy, Suspense } from "react";
import {
  Mic, Video, Subtitles, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Lazy-load heavy components to keep initial bundle small
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));
const WebcamRecorder = lazy(() => import("@/components/studio/WebcamRecorder").then(m => ({ default: m.WebcamRecorder })));
const Teleprompter = lazy(() => import("@/components/studio/Teleprompter").then(m => ({ default: m.Teleprompter })));
const DeliveryCoach = lazy(() => import("@/components/studio/DeliveryCoach"));
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const VoiceCloneManager = lazy(() => import("@/components/studio/VoiceCloneManager"));

type FeatureTab =
  | "record"
  | "voiceover"
  | "captions";

interface TabDef {
  id: FeatureTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const TABS: TabDef[] = [
  { id: "record", label: "Record", icon: Video, description: "Webcam recording with teleprompter" },
  { id: "voiceover", label: "Voiceover", icon: Mic, description: "AI voice narration with word timestamps" },
  { id: "captions", label: "Captions", icon: Subtitles, description: "Auto-generated subtitles in 4 styles" },
];

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

interface VoiceoverResult {
  sceneId: string;
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: Array<{ word: string; start: number; end: number }>;
}

interface Props {
  scriptText?: string;
  scenes?: Array<{ id: string; title?: string; text?: string; items?: string[]; skills?: string[] }>;
  projectId?: string;
  onVoiceoverGenerated?: (results: VoiceoverResult[]) => void;
}

export default function StudioFeaturesHub({
  scriptText,
  scenes,
  projectId,
  onVoiceoverGenerated,
}: Props) {
  const [activeTab, setActiveTab] = useState<FeatureTab>("record");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [coachingResult, setCoachingResult] = useState<any>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [teleprompterText, setTeleprompterText] = useState(scriptText ?? "");
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<"standard" | "bold-pop" | "word-by-word" | "lower-thirds">("standard");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              activeTab === tab.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Suspense fallback={<Loading />}>
          {activeTab === "record" && (
            <div className="space-y-4">
              <WebcamRecorder
                onRecordingComplete={(blob, durationMs) => {
                  setRecordedBlob(blob);
                }}
                teleprompterText={teleprompterText}
                mode="webcam"
              />
              {teleprompterText && (
                <Teleprompter
                  text={teleprompterText}
                  isScrolling={isScrolling}
                  onToggleScroll={() => setIsScrolling(!isScrolling)}
                  position="bottom"
                />
              )}
              {recordedBlob && (
                <DeliveryCoach
                  result={coachingResult}
                  onReRecord={() => {
                    setRecordedBlob(null);
                    setCoachingResult(null);
                  }}
                />
              )}
            </div>
          )}

          {activeTab === "voiceover" && scenes && (
            <div className="space-y-4">
              <VoiceCloneManager
                onVoiceSelected={(voiceId, voiceName) => {
                  // The voiceover panel will use these
                }}
              />
              <VoiceoverPanel
                scenes={scenes}
                projectId={projectId}
                onVoiceoverGenerated={(results) => {
                  onVoiceoverGenerated?.(results);
                }}
              />
            </div>
          )}

          {activeTab === "captions" && (
            <CaptionEditor
              cues={[]}
              style={captionStyle}
              onStyleChange={(s) => setCaptionStyle(s as typeof captionStyle)}
              enabled={captionsEnabled}
              onToggle={() => setCaptionsEnabled((v) => !v)}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
