/**
 * Single source for the help-item kind → icon mapping. The drawer, the
 * /help/:slug reader, and any future help surface share this so the icon
 * for a `faq` vs `guide` is consistent everywhere (DRY — the branch lived
 * in two components before).
 */

import { HelpCircle, BookOpen, type LucideIcon } from "lucide-react";
import type { HelpKind } from "@shared/help";

const ICONS: Record<HelpKind, LucideIcon> = {
  faq: HelpCircle,
  guide: BookOpen,
};

export function helpKindIcon(kind: string): LucideIcon {
  return ICONS[kind as HelpKind] ?? HelpCircle;
}
