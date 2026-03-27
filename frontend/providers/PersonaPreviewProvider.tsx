import React, { createContext, useContext, useState, useCallback } from "react";

interface PersonaPreviewContextValue {
  personaPreview: string | null;
  setPersonaPreview: (role: string | null) => void;
}

const PersonaPreviewContext = createContext<PersonaPreviewContextValue | null>(null);

export function PersonaPreviewProvider({ children }: { children: React.ReactNode }) {
  const [personaPreview, setPersonaPreviewState] = useState<string | null>(null);

  const setPersonaPreview = useCallback((role: string | null) => {
    setPersonaPreviewState(role);
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
