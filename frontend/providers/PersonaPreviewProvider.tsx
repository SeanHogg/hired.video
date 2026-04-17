import React, { createContext, useContext, useState, useCallback } from "react";

const STORAGE_KEY = "superadmin_persona_preview";
const TIER_STORAGE_KEY = "superadmin_persona_preview_tier";

export type PreviewTier = "free" | "pro";

interface PersonaPreviewContextValue {
  /** Previewed role, or null when no preview is active. */
  personaPreview: string | null;
  /** Previewed tier — drives useSubscription / useTokenBudget overrides.
   *  Null means "use the SA's real tier" (i.e. unlimited). */
  tierPreview: PreviewTier | null;
  setPersonaPreview: (role: string | null, tier?: PreviewTier | null) => void;
}

const PersonaPreviewContext = createContext<PersonaPreviewContextValue | null>(null);

function readStoredTier(): PreviewTier | null {
  try {
    const v = localStorage.getItem(TIER_STORAGE_KEY);
    return v === "free" || v === "pro" ? v : null;
  } catch {
    return null;
  }
}

export function PersonaPreviewProvider({ children }: { children: React.ReactNode }) {
  const [personaPreview, setPersonaPreviewState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [tierPreview, setTierPreviewState] = useState<PreviewTier | null>(readStoredTier);

  const setPersonaPreview = useCallback((role: string | null, tier: PreviewTier | null = null) => {
    setPersonaPreviewState(role);
    setTierPreviewState(role ? tier : null);
    try {
      if (role) {
        localStorage.setItem(STORAGE_KEY, role);
        if (tier) localStorage.setItem(TIER_STORAGE_KEY, tier);
        else localStorage.removeItem(TIER_STORAGE_KEY);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TIER_STORAGE_KEY);
      }
    } catch { /* ignore */ }

    document.title = document.title.replace(/ — \[Role Preview:.*?\]$/, "");
    if (role) {
      const label = tier ? `${role} (${tier})` : role;
      document.title += ` — [Role Preview: ${label}]`;
    }
  }, []);

  return (
    <PersonaPreviewContext.Provider value={{ personaPreview, tierPreview, setPersonaPreview }}>
      {children}
    </PersonaPreviewContext.Provider>
  );
}

export function usePersonaPreview(): PersonaPreviewContextValue {
  const ctx = useContext(PersonaPreviewContext);
  if (!ctx) throw new Error("usePersonaPreview must be used within PersonaPreviewProvider");
  return ctx;
}
