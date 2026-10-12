/**
 * The studio's image generator, opened from the kit Chat's "Create an image"
 * action: the SAME MediaAiPromptPanel the studio uses (its gate is
 * useMediaAiPrompt's, under the frame's anon gate like Elements), in the
 * chat's shared inline panel (ChatGeneratorPanel); the result lands on the
 * open scene's frame.
 */
import { useTranslation } from "react-i18next";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import { AnonGateContext, type AnonGateValue } from "@/lib/studio/anon-gate-context";
import { persistGeneratedImage } from "@/lib/studio/media-persistence";
import ChatGeneratorPanel from "../ChatGeneratorPanel";

interface KitChatGeneratorProps {
  gate: AnonGateValue;
  onImage: (url: string) => void;
  onClose: () => void;
}

export default function KitChatGenerator({ gate, onImage, onClose }: KitChatGeneratorProps) {
  const { t } = useTranslation();
  return (
    <ChatGeneratorPanel onClose={onClose}>
      <AnonGateContext.Provider value={gate}>
        <MediaAiPromptPanel
          kindNoun="image"
          placeholder={t("studio.editorV2.aiPromptPlaceholderImage")}
          onGenerated={async (result) => {
            onImage(await persistGeneratedImage(result));
            onClose();
          }}
        />
      </AnonGateContext.Provider>
    </ChatGeneratorPanel>
  );
}
