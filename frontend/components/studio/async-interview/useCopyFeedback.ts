import { useState } from "react";
import { COPY_FEEDBACK_MS, copyTextToClipboard } from "./helpers";

/** Copies `text` and flips `copied` true for a short confirmation. */
export function useCopyFeedback(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyTextToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };
  return { copied, copy };
}
