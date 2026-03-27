import React, { useState } from "react";
import { X, Copy, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePermissionDebugger, type PermissionCheck } from "@/providers/PermissionDebuggerProvider";
import { useAuth } from "@/lib/auth";

type Tab = "page" | "user" | "missing";

export function PermissionDebuggerPanel() {
  const { debugMode, toggleDebugMode, checks } = usePermissionDebugger();
  const { user, impersonationSession } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("page");
  const [copied, setCopied] = useState(false);

  if (!debugMode) return null;

  const allChecks = Array.from(checks.values());
  const grantedChecks = allChecks.filter((c) => c.status === "granted");
  const deniedChecks = allChecks.filter((c) => c.status === "denied" || c.status === "soft-gate");
  const missingChecks = allChecks.filter((c) => c.status === "denied");

  const displayChecks: PermissionCheck[] =
    activeTab === "page" ? allChecks :
    activeTab === "user" ? grantedChecks :
    missingChecks;

  const handleCopyAll = async () => {
    const data = JSON.stringify(
      {
        user: user?.email,
        role: impersonationSession?.role ?? user?.role,
        totalPermissions: allChecks.length,
        granted: grantedChecks.length,
        denied: deniedChecks.length,
        checks: allChecks.map((c) => ({
          permission: c.permission,
          status: c.status,
          source: c.source,
          count: c.count,
        })),
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusIcon = (status: PermissionCheck["status"]) => {
    if (status === "granted") return <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />;
    if (status === "soft-gate") return <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />;
    return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
  };

  const effectiveRole = impersonationSession?.role ?? user?.role ?? "—";
  const displayName = impersonationSession ? impersonationSession.targetUser.name : (user?.name ?? "—");

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: 380,
        maxHeight: "60vh",
        backgroundColor: "hsl(var(--background))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid hsl(var(--border))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Permission Debugger</span>
        <div style={{ display: "flex", gap: 4 }}>
          <Button variant="ghost" size="sm" onClick={handleCopyAll} className="h-6 px-2 text-xs">
            {copied ? "Copied!" : <><Copy className="h-3 w-3 mr-1" />Copy All</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleDebugMode} className="h-6 w-6 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Context line */}
      <div style={{ padding: "4px 12px", borderBottom: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        {displayName} · Role: <strong>{effectiveRole}</strong> · Active: {grantedChecks.length} / {allChecks.length} permissions
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid hsl(var(--border))" }}>
        {(["page", "user", "missing"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "4px 0",
              fontSize: 11,
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid hsl(var(--primary))" : "2px solid transparent",
              color: activeTab === tab ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              cursor: "pointer",
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {tab} {tab === "missing" && missingChecks.length > 0 && `(${missingChecks.length})`}
          </button>
        ))}
      </div>

      {/* Permission list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {displayChecks.length === 0 ? (
          <div style={{ padding: 16, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
            No permissions {activeTab === "missing" ? "denied" : "registered"} on this page.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "hsl(var(--muted))", position: "sticky", top: 0 }}>
                <th style={{ padding: "3px 8px", textAlign: "left", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Permission</th>
                <th style={{ padding: "3px 8px", textAlign: "center", width: 20 }}></th>
                <th style={{ padding: "3px 8px", textAlign: "left", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Source</th>
                <th style={{ padding: "3px 8px", textAlign: "right", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>#</th>
              </tr>
            </thead>
            <tbody>
              {displayChecks.map((check) => (
                <tr key={check.permission} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  <td style={{ padding: "3px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span title={check.permission}>{check.permission}</span>
                  </td>
                  <td style={{ padding: "3px 8px", textAlign: "center" }}>
                    {statusIcon(check.status)}
                  </td>
                  <td style={{ padding: "3px 8px", color: "hsl(var(--muted-foreground))" }}>
                    {check.source}
                  </td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: "hsl(var(--muted-foreground))" }}>
                    {check.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
