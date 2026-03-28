import React, { createContext, useContext, useState, useCallback } from "react";

const STORAGE_KEY = "superadmin_persona_preview";

interface PersonaPreviewContextValue {
  personaPreview: string | null;
  setPersonaPreview: (role: string | null) => void;
}

const PersonaPreviewContext = createContext<PersonaPreviewContextValue | null>(null);

export function PersonaPreviewProvider({ children }: { children: React.ReactNode }) {
  const [personaPreview, setPersonaPreviewState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  const setPersonaPreview = useCallback((role: string | null) => {
    setPersonaPreviewState(role);
    try {
      if (role) localStorage.setItem(STORAGE_KEY, role);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    // Update document title as a side-effect of the state change
    document.title = document.title.replace(/ — \[Role Preview:.*?\]$/, "");
    if (role) {
      document.title += ` — [Role Preview: ${role}]`;
    }
  }, []);

  return (
    <PersonaPreviewContext.Provider value={{ personaPreview, setPersonaPreview }}>
      {children}
    </PersonaPreviewContext.Provider>
  );
}

export function usePersonaPreview(): PersonaPreviewContextValue {
  const ctx = useContext(PersonaPreviewContext);
  if (!ctx) throw new Error("usePersonaPreview must be used within PersonaPreviewProvider");
  return ctx;
}
