/**
 * useKitTools — the content of each rail tool on a career kit, keyed by the
 * registry's ids (a `Record`, so a new registry tool can't be forgotten).
 * Content is null where a tool has nothing for the open page — it greys out
 * in place:
 *
 *   Chat      the conversation (intake, stage plan, reviews, tool cards) +
 *             the composer with the chat's actions (the stage's résumé
 *             tools + the studio's AI tools, lib/workspace/chat-actions.ts)
 *             — every page
 *   Design    résumé / letter: structure + template + suggestions; video:
 *             the whole video's colour look
 *   Sections  the section list / the open section's editor — résumé page
 *   Media     the photo + the video's music — résumé and video pages
 *   Scenes    (Advanced) the five scenes: on/off, open, their source
 *   Elements  (Advanced) the studio's element palette onto the frame, or
 *             onto the résumé / letter page
 *   Layers    (Advanced) the selected scene's elements, restackable — or
 *             the page's free elements: restack, select, hide, lock
 *             (both: ONE useKitElementTools over the page's target adapter)
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { totalDurationSeconds } from "@/lib/studio/editor-v2/canvas-state";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import { railToolsFor, type RailToolId } from "@/lib/workspace/workspace-panels";
import type { WorkspaceDepth } from "@/lib/workspace/workspace-depth";
import BuildConversation from "@/components/build/BuildConversation";
import BuildChatComposer from "@/components/build/BuildChatComposer";
import DesignPanel from "@/components/build/DesignPanel";
import VideoDesignPanel from "@/components/build/VideoDesignPanel";
import SectionsPanel from "@/components/build/SectionsPanel";
import SectionEditPanel from "@/components/build/SectionEditPanel";
import MediaPanel from "@/components/build/MediaPanel";
import VoicePanel from "@/components/build/voice/VoicePanel";
import KitStoryPanel from "./KitStoryPanel";
import KitSaveDesignTemplate from "./KitSaveDesignTemplate";
import StagePlanCard from "@/components/build/StagePlanCard";
import ChatActionChips from "../ChatActionChips";
import KitChatGenerator from "./KitChatGenerator";
import StageFollowUp from "@/components/build/StageFollowUp";
import ReviewChatPanel from "@/components/build/review/ReviewChatPanel";
import type { WorkspaceTool } from "../WorkspaceLeftPanel";
import { useKitElementTools } from "./useKitElementTools";
import { useKitDocumentElementTarget, useKitVideoElementTarget } from "./useKitElementTargets";

const PAD = "flex flex-col gap-4 p-4";

interface Args {
  kit: KitWorkspace;
  depth: WorkspaceDepth;
  /** Bring the canvas into view (phones: closes the tool sheet). */
  showCanvas: () => void;
}

export function useKitTools({ kit, depth, showCanvas }: Args): WorkspaceTool[] {
  const { t } = useTranslation();
  const { ready, intake, entry, chat, journey, review, reviewIntake, nav, panel, picks, history, video, editor, reimport } = kit;
  const { plan } = journey;
  const onVideo = nav.page === "video";
  const frame = editor.frame;
  // The Chat's "Create an image" action: the generator under the conversation.
  const [generating, setGenerating] = useState(false);
  // Elements / Layers: the frame on the video page, else the page's free elements.
  const videoTarget = useKitVideoElementTarget(kit);
  const documentTarget = useKitDocumentElementTarget(kit);
  const elementTools = useKitElementTools(videoTarget ?? documentTarget);

  const content: Record<RailToolId, ReactNode | null> = {
    chat: (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* `relative`: the scroller must contain its absolute (sr-only) children, or they
            escape it and scroll the whole panel — a second scrollbar. */}
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <BuildConversation
            status={intake.status}
            source={intake.source}
            entry={entry.status}
            ready={
              ready
                ? { insights: ready.insights, sceneCount: ready.outline.scenes.length, seconds: totalDurationSeconds(ready.canvas) }
                : null
            }
            turns={chat.turns}
            runs={journey.runs}
            busy={chat.busy}
            onFile={intake.parseFile}
            onText={intake.parseText}
            onExistingResume={intake.adoptContent}
            onStartOver={nav.startOver}
            onJumpToPreview={showCanvas}
            onChangeDesign={() => panel.show("design")}
            onWatchVideo={() => {
              nav.setPage("video");
              showCanvas();
            }}
            review={
              ready ? (
                <ReviewChatPanel
                  review={review}
                  intake={reviewIntake}
                  onViewLetter={() => {
                    nav.setPage("letter");
                    showCanvas();
                  }}
                />
              ) : null
            }
            reviewAt={kit.reviewAt}
            plan={<StagePlanCard controls={plan} />}
            next={<StageFollowUp stage={nav.stage} plan={plan} onGo={nav.goToStage} onPost={nav.openPost} />}
            onReviewRevision={review.reviewLastRevision}
          />
        </div>
        {generating && ready && onVideo && (
          <KitChatGenerator
            gate={frame.uploadGate}
            onImage={(url) => frame.insertMedia("image", url)}
            onClose={() => setGenerating(false)}
          />
        )}
        <BuildChatComposer
          ready={ready !== null}
          tab={nav.page}
          disabled={intake.status === "parsing" || chat.busy || reimport.busy || reviewIntake.reading || entry.status === "loading"}
          onStartFile={intake.parseFile}
          onStartText={intake.parseText}
          onAttach={(file) => {
            panel.show("chat");
            void reviewIntake.attach(file);
          }}
          onRoute={reviewIntake.message}
          onChange={(text) => void kit.askChat(text)}
          chips={
            <ChatActionChips
              context={{ surface: "kit", stage: nav.stage, page: nav.page, can: { generate: ready !== null && onVideo } }}
              handlers={{
                tool: journey.openTool,
                prompt: (text) => void kit.askChat(text),
                generate: () => setGenerating(true),
              }}
              disabled={plan.busy}
            />
          }
        />
      </div>
    ),
    design: ready && onVideo ? (
      <div className={PAD}>
        <VideoDesignPanel video={video} />
      </div>
    ) : ready ? (
      <div className={PAD}>
        <DesignPanel
          structure={picks.structure}
          recommended={ready.insights.recommendedStructure}
          onStructureChange={picks.setStructure}
          suggestedTemplates={picks.suggestedTemplates}
          templateId={picks.templateId}
          onTemplateChange={picks.setTemplateId}
          resume={ready.resume}
          usingSavedDesign={picks.usingSavedDesign}
          hasStudioLayout={picks.hasStudioLayout}
        />
        <KitSaveDesignTemplate kit={kit} />
      </div>
    ) : null,
    sections:
      ready && nav.page === "resume" ? (
        <div className={PAD}>
          {panel.editing ? (
            <SectionEditPanel
              key={panel.editing}
              sectionKey={panel.editing}
              content={ready.content}
              onChange={kit.commitEdit}
              onClose={panel.closeEditor}
            />
          ) : (
            <SectionsPanel content={ready.content} onEdit={panel.editSection} />
          )}
        </div>
      ) : null,
    media: ready && nav.page !== "letter" ? (
      <div className={PAD}>
        <MediaPanel content={ready.content} music={ready.outline.music} onChange={history.commit} onMusicChange={video.setMusic} />
        {onVideo && <VoicePanel video={video} />}
      </div>
    ) : null,
    scenes:
      ready && onVideo ? (
        <div className={PAD}>
          <KitStoryPanel kit={kit} />
        </div>
      ) : null,
    elements: elementTools.elements,
    layers: elementTools.layers,
  };

  return railToolsFor(depth).map((def) => ({
    id: def.id,
    label: t(def.labelKey),
    icon: def.icon,
    content: content[def.id],
  }));
}
