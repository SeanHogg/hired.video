/**
 * StudioFeaturesHub — unified page for all new studio capabilities.
 *
 * Tabs:
 *   - Record (webcam + teleprompter)
 *   - Voiceover (TTS + voice cloning)
 *   - Captions (auto-caption editor)
 *   - Interview (question practice)
 *   - Skills Demo (screen + webcam)
 *   - Analytics (Wistia-quality heatmap)
 *   - ATS Package (shareable link + summary)
 *   - Async Interview (recruiter → candidate)
 */

import { useState, lazy, Suspense } from "react";
import {
  Mic, Video, Subtitles, MessageSquare, Code2,
  BarChart3, FileText, Users, ChevronRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

// Lazy-load heavy components to keep initial bundle small
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));
const WebcamRecorder = lazy(() => import("@/components/studio/WebcamRecorder"));
const Teleprompter = lazy(() => import("@/components/studio/Teleprompter"));
const DeliveryCoach = lazy(() => import("@/components/studio/DeliveryCoach"));
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const InterviewPractice = lazy(() => import("@/components/studio/InterviewPractice"));
const SkillsDemoCreator = lazy(() => import("@/components/studio/SkillsDemoCreator"));
const VideoAnalyticsDashboard = lazy(() => import("@/components/studio/VideoAnalyticsDashboard"));
const ATSPackageGenerator = lazy(() => import("@/components/studio/ATSPackageGenerator"));
const VoiceCloneManager = lazy(() => import("@/components/studio/VoiceCloneManager"));
const AsyncInterviewManager = lazy(() => import("@/components/studio/AsyncInterviewManager"));
const LinkedInPublisher = lazy(() => import("@/components/studio/LinkedInPublisher"));

type FeatureTab =
  | "record"
  | "voiceover"
  | "captions"
  | "interview"
  | "skills"
  | "analytics"
  | "ats"
  | "async-interview"
  | "linkedin";

interface TabDef {
  id: FeatureTab;
  label: string;
  icon: React.ElementType;
  description: string;
  badge?: string;
}

const TABS: TabDef[] = [
  { id: "record", label: "Record", icon: Video, description: "Webcam recording with teleprompter", badge: "New" },
  { id: "voiceover", label: "Voiceover", icon: Mic, description: "AI voice narration with word timestamps", badge: "New" },
  { id: "captions", label: "Captions", icon: Subtitles, description: "Auto-generated subtitles in 4 styles" },
  { id: "interview", label: "Interview Practice", icon: MessageSquare, description: "AI coaching for interview answers", badge: "New" },
  { id: "skills", label: "Skills Demo", icon: Code2, description: "Screen + webcam skill showcase videos", badge: "New" },
  { id: "analytics", label: "Analytics", icon: BarChart3, description: "Per-second viewer engagement heatmap", badge: "New" },
  { id: "ats", label: "ATS Package", icon: FileText, description: "Shareable link + text summary for ATS" },
  { id: "async-interview", label: "Async Interview", icon: Users, description: "Send video interview to candidates" },
  { id: "linkedin", label: "LinkedIn", icon: ChevronRight, description: "Publish videos directly to LinkedIn" },
];

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

interface Props {
  projectId?: string;
  videoId?: string;
  resumeText?: string;
  scriptText?: string;
  scenes?: Array<{ id: string; title?: string; text?: string; items?: string[]; skills?: string[] }>;
  videoBlob?: Blob | null;
  videoUrl?: string;
  videoDurationSec?: number;
  candidateName?: string;
  headline?: string;
}

export default function StudioFeaturesHub({
  projectId,
  videoId,
  resumeText,
  scriptText,
  scenes,
  videoBlob,
  videoUrl,
  videoDurationSec,
  candidateName,
  headline,
}: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FeatureTab>("record");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [coachingResult, setCoachingResult] = useState<any>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [teleprompterText, setTeleprompterText] = useState(scriptText ?? "");

  const isRecruiter = user?.roles?.includes("recruiter") || user?.roles?.includes("admin");

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
            {tab.badge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                {tab.badge}
              </span>
            )}
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
                  // Forward to parent for integration with video export
                }}
              />
            </div>
          )}

          {activeTab === "captions" && (
            <CaptionEditor
              cues={[]}
              style="standard"
              onStyleChange={() => {}}
              enabled={true}
              onToggle={() => {}}
            />
          )}

          {activeTab === "interview" && (
            <InterviewPractice
              resumeText={resumeText}
              onStartRecording={(question) => {
                setTeleprompterText(question.text);
                setActiveTab("record");
              }}
            />
          )}

          {activeTab === "skills" && (
            <SkillsDemoCreator
              resumeText={resumeText}
              onRecordingStart={() => setActiveTab("record")}
            />
          )}

          {activeTab === "analytics" && videoId && (
            <VideoAnalyticsDashboard
              videoId={videoId}
              videoDurationSec={videoDurationSec}
            />
          )}
          {activeTab === "analytics" && !videoId && (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>Export and publish a video first to see analytics.</p>
            </div>
          )}

          {activeTab === "ats" && projectId && (
            <ATSPackageGenerator
              projectId={projectId}
              scriptText={scriptText ?? ""}
              videoUrl={videoUrl}
              candidateName={candidateName}
              headline={headline}
            />
          )}
          {activeTab === "ats" && !projectId && (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>Save your project first to generate an ATS package.</p>
            </div>
          )}

          {activeTab === "async-interview" && (
            <AsyncInterviewManager
              isRecruiter={isRecruiter}
            />
          )}

          {activeTab === "linkedin" && projectId && (
            <LinkedInPublisher
              projectId={projectId}
              videoBlob={videoBlob}
              defaultText={scriptText ? `Check out my video resume! ${scriptText.slice(0, 200)}...` : ""}
            />
          )}
          {activeTab === "linkedin" && !projectId && (
            <div className="text-center py-16 text-muted-foreground">
              <ChevronRight className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>Export a video first to publish to LinkedIn.</p>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
