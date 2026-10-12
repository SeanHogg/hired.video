/**
 * The kit composer, routed. Before a résumé exists it starts one (a
 * self-description, or a file on the paperclip). Once one is open:
 *
 *   paperclip   → the review intake (another résumé → merge / start over /
 *                 compare; a job post → tailor / create / score). A second
 *                 résumé never silently replaces the open one.
 *   message     → a job link / pasted job post / intent goes to the review
 *                 intake; anything else is a change request for the chat.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isAcceptedResumeFile } from "@/lib/build-entry";
import type { KitPage } from "@/lib/workspace/kit-stages";
import BuildComposer, { type ComposerSuggestion } from "./BuildComposer";

const CHANGE_SUGGESTIONS: readonly ComposerSuggestion[] = [
  { labelKey: "build.composer.chip.punchier" },
  { labelKey: "build.composer.chip.tailor" },
  { labelKey: "build.composer.chip.onePage" },
  { labelKey: "build.composer.chip.ownVoice" },
];

interface BuildChatComposerProps {
  /** A résumé is open. */
  ready: boolean;
  tab: KitPage;
  disabled: boolean;
  /** Start a draft (no résumé yet). */
  onStartFile: (file: File) => void;
  onStartText: (text: string) => void;
  /** Hand something to the open résumé's review intake. */
  onAttach: (file: File) => void;
  /** True when the review intake took the message. */
  onRoute: (text: string) => Promise<boolean>;
  /** An ordinary change request. */
  onChange: (text: string) => void;
  /** The chat's action chips (ChatActionChips), ahead of the suggestions. */
  chips?: ReactNode;
}

export default function BuildChatComposer({
  ready,
  tab,
  disabled,
  onStartFile,
  onStartText,
  onAttach,
  onRoute,
  onChange,
  chips,
}: BuildChatComposerProps) {
  const { t } = useTranslation();
  return (
    <BuildComposer
      placeholder={
        !ready
          ? t("build.composer.describePlaceholder")
          : tab === "video"
            ? t("build.composer.scenePlaceholder")
            : t("build.composer.reviewPlaceholder")
      }
      suggestions={ready ? CHANGE_SUGGESTIONS : []}
      chips={ready ? chips : undefined}
      disabled={disabled}
      onAttach={(file) => {
        if (ready) onAttach(file);
        else if (isAcceptedResumeFile(file)) onStartFile(file);
      }}
      onSubmit={(text) => {
        if (!ready) {
          onStartText(text);
          return;
        }
        void onRoute(text).then((routed) => {
          if (!routed) onChange(text);
        });
      }}
    />
  );
}
