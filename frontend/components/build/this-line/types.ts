/**
 * What every "This line" drill receives: the selected résumé line's data
 * (useThisLine), the finding actions, the kit chat, and the résumé's design
 * — its look over the template (font, size, spacing, colour, page;
 * resume-style.ts) and the descriptor it renders with now.
 */
import type { ResolvedLine } from "@/lib/build/this-line";
import type { FindingActions } from "@/lib/build/use-finding-actions";
import type { ResumeStyle } from "@/lib/build/resume-style";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import type { ThisLine } from "./use-this-line";

export interface ResumeDesignControl {
  style: ResumeStyle;
  /** Lays a patch over the look (undefined = back to the template's). */
  setStyle: (patch: Partial<ResumeStyle>) => void;
  /** What the résumé renders with now (template + structure + style). */
  descriptor: ResumeTemplateDescriptor;
}

export interface LineDrillProps {
  data: ThisLine & { line: ResolvedLine };
  actions: FindingActions;
  /** Sends a request to the kit's chat (the AI revises the draft). */
  onAsk: (text: string) => void;
  design: ResumeDesignControl;
}
