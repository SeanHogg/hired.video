// Single "Open studio" CTA button — the canonical entry point from any
// marketing surface into the in-app editor.
//
// Per the standing DRY rule, every marketing page that links into the
// studio renders this component instead of hand-rolling a `<Button asChild>
// <Link to=…>` pair. When the editor's deep-link contract changes only this
// file updates; every page picks it up automatically.
//
// A `templateId` drops the visitor STRAIGHT into the editor on a fresh draft
// seeded with that template (`/studio/new?contentTemplate=<id>`) — works
// signed-out (localStorage draft + sign-up gate on Save) and signed-in (the
// editor autosaves a real project). This replaces the old `/studio?template=`
// link, which collided with the legacy *visual-theme* `?template=` param and
// never actually seeded the content template.

import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface StudioOpenCTAProps {
  /** When set, the URL becomes `/studio/new?contentTemplate=<id>` so the
   *  editor opens a fresh draft seeded with that template (resolved via
   *  `slugToBuiltinId(...) ?? id` in `StudioEditorV2`). When omitted, the URL
   *  is `/studio` (the workspace / unfiltered chooser). */
  templateId?: string;
  /** Visible label. Defaults to "Open in studio" when a template is given,
   *  "Open the studio" otherwise — matches the prior hand-rolled copy. */
  label?: string;
  /** Render a trailing arrow icon. Heroes use it; final-CTA blocks usually
   *  don't (the section already telegraphs forward motion). */
  withArrow?: boolean;
  /** Forwarded to the underlying `<Button>` size prop. */
  size?: "default" | "sm" | "lg";
}

export function StudioOpenCTA({
  templateId,
  label,
  withArrow = false,
  size = "lg",
}: StudioOpenCTAProps): JSX.Element {
  const to = templateId
    ? `/studio/new?contentTemplate=${encodeURIComponent(templateId)}`
    : "/studio";
  const text = label ?? (templateId ? "Open in studio" : "Open the studio");
  return (
    <Button asChild size={size}>
      <Link to={to}>
        <Sparkles className="mr-2 h-4 w-4" />
        {text}
        {withArrow ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
      </Link>
    </Button>
  );
}
