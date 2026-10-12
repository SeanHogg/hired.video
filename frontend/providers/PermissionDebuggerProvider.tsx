import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type PermissionStatus = "granted" | "denied" | "soft-gate";
export type PermissionSource = "role" | "module" | "override" | "unknown";

export interface PermissionCheck {
  permission: string;
  status: PermissionStatus;
  source: PermissionSource;
  requiredRoles?: string[];
  currentRole?: string;
  elementLabel?: string;
  count: number; // how many elements on page use this permission
}

interface PermissionDebuggerContextType {
  debugMode: boolean;
  toggleDebugMode: () => void;
  registerCheck: (permission: string, status: PermissionStatus, meta?: Omit<PermissionCheck, "permission" | "status" | "count">) => void;
  checks: Map<string, PermissionCheck>;
  clearChecks: () => void;
}

const PermissionDebuggerContext = createContext<PermissionDebuggerContextType | undefined>(undefined);

export function PermissionDebuggerProvider({ children }: { children: React.ReactNode }) {
  const [debugMode, setDebugMode] = useState(false);
  const [checks, setChecks] = useState<Map<string, PermissionCheck>>(new Map());
  // Use ref for the actual mutable map to avoid stale closures in registerCheck
  const checksRef = useRef<Map<string, PermissionCheck>>(new Map());

  const toggleDebugMode = useCallback(() => {
    setDebugMode((prev) => !prev);
    // Clear registered checks when toggling so they re-register on next render
    checksRef.current = new Map();
    setChecks(new Map());
  }, []);

  const registerCheck = useCallback(
    (
      permission: string,
      status: PermissionStatus,
      meta?: Omit<PermissionCheck, "permission" | "status" | "count">,
    ) => {
      const existing = checksRef.current.get(permission);
      const updated: PermissionCheck = {
        permission,
        status,
        source: meta?.source ?? "role",
        requiredRoles: meta?.requiredRoles,
        currentRole: meta?.currentRole,
        elementLabel: meta?.elementLabel,
        count: (existing?.count ?? 0) + 1,
      };
      checksRef.current.set(permission, updated);
      // Batch state update using a shallow copy
      setChecks(new Map(checksRef.current));
    },
    [],
  );

  const clearChecks = useCallback(() => {
    checksRef.current = new Map();
    setChecks(new Map());
  }, []);

  // Global keyboard shortcut Ctrl+Shift+P to toggle debugger
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        toggleDebugMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleDebugMode]);

  return (
    <PermissionDebuggerContext.Provider value={{ debugMode, toggleDebugMode, registerCheck, checks, clearChecks }}>
      {children}
    </PermissionDebuggerContext.Provider>
  );
}

export function usePermissionDebugger() {
  const ctx = useContext(PermissionDebuggerContext);
  if (!ctx) throw new Error("usePermissionDebugger must be used within PermissionDebuggerProvider");
  return ctx;
}
