/**
 * Studio landing page — the PowerPoint-style chooser shown at /studio.
 * Thin page that composes self-contained sections (each lives under
 * `components/studio/landing/` and gates its own visibility):
 *
 *   - StudioLandingHero / StudioLandingMarketingSections — the signed-out
 *     marketing hero above the workspace and the pitch band below it.
 *   - StudioLandingSearchHeader — the sticky search (live filter for every
 *     section below, #1917) + the ONE "+ New" menu.
 *   - KitStartBand — the three starts in one row: the kit drop zone, "Or
 *     start with one", and TemplateStartPanel (a few template picks).
 *   - YourWorkSection (+ MyContentDialogs) — ONE list of the viewer's kits
 *     and every other project.
 *   - TemplatesSection (`#templates`) — built-in + owned templates (the
 *     template picks' "See all").
 *
 * Data lives in hooks under `lib/studio/landing/`: `useMyContent` (projects
 * + kits — "Your work" and the create seam's optimistic prepend), `useOwnedTemplates`, and `useStudioLandingEntry` — the
 * deep-link bounce (`?capture=`, `?subject=`, `?contentTemplate=`,
 * `?studioTemplate=`, `?template=`, `?new=1`, edit params; one handler each
 * in `lib/studio/landing/entry/`) that mints the project SERVER-SIDE via
 * `useCreateStudioDraft` and navigates straight to `/studio/<real-id>`.
 * While it's `pending` the page shows the loading shell and the two data
 * hooks hold their fetches.
 *
 * /studio is one surface for everyone: signed-in users get the workspace;
 * signed-out visitors get the SAME workspace topped with a marketing hero,
 * an empty "Your work" (nothing saved until they have an account), and
 * template clicks that drop into the anon editor (the create seam in
 * `useCreateStudioDraft` routes anon users there).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { useBreadcrumbs, useSEO } from "@/lib/seo";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import type { StudioProject } from "@/lib/services/studio-service";
import { useMyContent } from "@/lib/studio/landing/use-my-content";
import { useOwnedTemplates } from "@/lib/studio/landing/use-owned-templates";
import { useStudioLandingEntry } from "@/lib/studio/landing/use-studio-landing-entry";
import {
  StudioLandingHero,
  StudioLandingMarketingSections,
} from "@/components/studio/landing/StudioLandingMarketing";
import StudioLandingSearchHeader from "@/components/studio/landing/StudioLandingSearchHeader";
import KitStartBand from "@/components/workspace/home/KitStartBand";
import TemplateStartPanel from "@/components/studio/landing/TemplateStartPanel";
import YourWorkSection from "@/components/studio/landing/YourWorkSection";
import MyContentDialogs from "@/components/studio/landing/MyContentDialogs";
import TemplatesSection from "@/components/studio/landing/TemplatesSection";
import CreateIntentChooser from "@/components/landing/CreateIntentChooser";
import PostJobLeadDialog from "@/components/studio/landing/PostJobLeadDialog";
import StudioLoadingShell from "./StudioLoadingShell";

export default function StudioLanding() {
  useSEO("/studio");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("labels.studio"), url: "/studio" }]);
  const [query, setQuery] = useState("");
  // Optimistic prepend so the user sees their new project in "Your work"
  // if they navigate back. Skips the hook's internal navigate so the
  // deep-link forwarder can append UI-state seed params (capture
  // mode, etc.) onto the destination URL. The prepend goes through a ref:
  // `useMyContent` is gated on the deep-link `pending`, which needs `create`.
  const prependRef = useRef<(project: StudioProject) => void>(() => {});
  const { create } = useCreateStudioDraft({
    skipNavigate: true,
    onCreated: (project) => prependRef.current(project),
  });
  const pending = useStudioLandingEntry(create);
  const content = useMyContent(query, { enabled: !pending });
  const owned = useOwnedTemplates(query, { enabled: !pending });
  useEffect(() => {
    prependRef.current = content.prependProject;
  });
  if (pending) return <StudioLoadingShell />;

  return (
    <AppShell>
    {/* Page padding is `p-4 md:p-6` so the action-bar bleed (`-mx-4 md:-mx-6`)
        cancels it exactly — the bands span the content column edge-to-edge
        with no side gap. */}
    <div className={APP_PAGE_COLUMN}>
      <StudioLandingHero />
      <StudioLandingSearchHeader onQueryChange={setQuery} />

      {/* What to make first (#2363): the resolved intent leads, the rest
          sit beside it — one tap to switch. */}
      <CreateIntentChooser />

      {/* Three starts in one row — make all three at once (the kit drop
          zone), start with one, or start from a template — then everything
          already made, then every format's templates (the New menu's
          "Browse every format" and the picks' "See all" land there). */}
      <KitStartBand aside={<TemplateStartPanel create={create} />} />
      <YourWorkSection content={content} />
      <TemplatesSection owned={owned} query={query} create={create} />
      <StudioLandingMarketingSections />
      <MyContentDialogs content={content} />
      {/* Signed-out "Post a job" lands here (?postJob=1) — lead capture (#1915). */}
      <PostJobLeadDialog />
    </div>
    </AppShell>
  );
}
