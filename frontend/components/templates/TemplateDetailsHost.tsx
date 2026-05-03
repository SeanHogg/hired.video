// Decides where TemplateInfoButton renders the details surface.
//
//  - "route" (default): clicking the (i) icon navigates to
//    /marketplace/templates/:slug. Used by every public marketplace surface
//    (homepage cards, search cards, profile-embedded gallery).
//
//  - "sheet": clicks open a side-panel Sheet inline so the visitor doesn't
//    leave the workspace. Used by the Studio (so picking a template from
//    the sidebar stays in the editor).
//
// Surfaces wrap their children with <TemplateDetailsHostProvider host="sheet">
// to opt in. The button reads from context, so consumers don't drill a
// canShowSheet / openInSheet boolean down to every card. DRY by construction.

import { createContext, useContext, type ReactNode } from "react";

export type TemplateDetailsHostMode = "route" | "sheet";

const TemplateDetailsHostContext = createContext<TemplateDetailsHostMode>("route");

interface ProviderProps {
  host: TemplateDetailsHostMode;
  children: ReactNode;
}

export function TemplateDetailsHostProvider({ host, children }: ProviderProps) {
  return (
    <TemplateDetailsHostContext.Provider value={host}>
      {children}
    </TemplateDetailsHostContext.Provider>
  );
}

export function useTemplateDetailsHost(): TemplateDetailsHostMode {
  return useContext(TemplateDetailsHostContext);
}
