// Single "Open studio" CTA button — the canonical entry point from any
// marketing surface into the in-app editor.
//
// Per the standing DRY rule, every marketing page that links into the
// studio renders this component instead of hand-rolling a `<Button asChild>
// <Link to=…>` pair. When the editor's deep-link contract changes (it has
// already shifted from `/studio/new` → `/studio?template=…`) only this
// file updates; every page picks it up automatically.

import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface StudioOpenCTAProps {
  /** When set, the URL becomes `/studio?template=<id>` so the editor
   *  pre-selects that template via the existing `searchParams.get("template")`
   *  contract in `StudioLayout` + `StudioEditorV2`. When omitted, the URL is
   *  `/studio` (the unfiltered chooser). */
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
  const to = templateId ? `/studio?template=${templateId}` : "/studio";
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
