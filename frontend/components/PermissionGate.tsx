import React, { useEffect } from "react";
import { usePermissionDebugger, type PermissionStatus, type PermissionSource } from "@/providers/PermissionDebuggerProvider";

interface PermissionGateProps {
  /** The permission key being checked (e.g. "canPostJobs") */
  permission: string;
  /** Whether the permission is currently granted */
  granted: boolean;
  /** Content to render when granted */
  children: React.ReactNode;
  /** Content to render when denied (soft-gate) — if omitted, nothing renders when denied */
  fallback?: React.ReactNode;
  /** Human-readable label for the debugger panel */
  label?: string;
  /** Required roles for this permission (shown in debug tooltip) */
  requiredRoles?: string[];
  /** Current user role (shown in debug tooltip) */
  currentRole?: string;
  /** Grant source for the debugger */
  source?: PermissionSource;
}

export function PermissionGate({
  permission,
  granted,
  children,
  fallback,
  label,
  requiredRoles,
  currentRole,
  source = "role",
}: PermissionGateProps) {
  const { debugMode, registerCheck } = usePermissionDebugger();

  const status: PermissionStatus = granted ? "granted" : fallback !== undefined ? "soft-gate" : "denied";

  // Register this check when the permission state or debug mode changes
  useEffect(() => {
    if (debugMode) {
      registerCheck(permission, status, { source, requiredRoles, currentRole, elementLabel: label });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugMode, permission, status, source, currentRole, registerCheck]);

  if (!debugMode) {
    // Normal mode: just show children if granted, fallback otherwise
    return granted ? <>{children}</> : fallback !== undefined ? <>{fallback}</> : null;
  }

  // Debug mode: wrap with colored border overlay
  const borderColor =
    status === "granted"
      ? "2px solid #22c55e"   // green
      : status === "soft-gate"
        ? "2px solid #f59e0b" // amber
        : "2px dashed #ef4444"; // red dashed

  const backgroundColor =
    status === "denied" ? "rgba(239, 68, 68, 0.05)" : "transparent";

  const tooltip = [
    `Permission: ${permission}`,
    `Status: ${status.toUpperCase()}`,
    currentRole ? `Role: ${currentRole}` : null,
    requiredRoles?.length ? `Required: ${requiredRoles.join(", ")}` : null,
    `Source: ${source}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      style={{ position: "relative", display: "contents" }}
      data-permission={permission}
      data-permission-status={status}
    >
      <div
        style={{
          outline: borderColor,
          outlineOffset: "2px",
          backgroundColor,
          position: "relative",
          display: "contents",
        }}
        title={tooltip}
      >
        {granted ? children : fallback !== undefined ? fallback : (
          // Ghost placeholder for denied elements
          <div
            style={{
              outline: borderColor,
              outlineOffset: "2px",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              minHeight: "24px",
              minWidth: "60px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 4px",
              borderRadius: "2px",
            }}
            title={tooltip}
          >
            <span style={{ fontSize: "9px", color: "hsl(var(--destructive))", fontFamily: "monospace", whiteSpace: "nowrap" }}>
              {permission}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
