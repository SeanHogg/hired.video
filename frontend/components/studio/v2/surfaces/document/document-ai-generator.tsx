/**
 * The document format's AI panel (#1934(2)): the shared image prompt
 * (MediaAiPromptPanel — same engine, metering and sign-in gate as every
 * studio surface), whose result drops onto the document as an image block
 * at the end of the page instead of running the video scene's image sink.
 */
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import { persistGeneratedImage } from "@/lib/studio/media-persistence";
import { insertGeneratedImageBlock } from "@/lib/studio/document/generated-image-block";
import type { DocumentSurfaceCtx } from "../types";

export function documentImageGenerator(ctx: DocumentSurfaceCtx) {
  const { setDocumentState, documentCommit } = ctx.document;
  return (
    <MediaAiPromptPanel
      kindNoun="image"
      placeholder={ctx.t("studio.document.ai.placeholder")}
      onGenerated={async (result) => {
        const url = await persistGeneratedImage(result);
        setDocumentState((prev) => insertGeneratedImageBlock(prev, url).state);
        documentCommit();
      }}
    />
  );
}
