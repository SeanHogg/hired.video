import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { apiClient } from "@/lib/api-client";
import { confirmDialog } from "@/lib/dialogs";
import { clearPlanOverride } from "@/lib/services/superadmin-plan-override-service";
import { isUserActive } from "./helpers";
import type { ApiUser } from "./types";

/** Single-user row actions. Every mutation calls `refresh` so list + stats stay in sync. */
export function useUserActions(refresh: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { startImpersonation } = useAuth();
  const [healingUserId, setHealingUserId] = useState<string | null>(null);

  const handleImpersonate = async (user: ApiUser) => {
    try {
      await startImpersonation(user.id, "Admin user management");
      toast({ title: t("messages.impersonatingUser", { name: user.name }) });
    } catch {
      toast({ title: t("errors.failedToImpersonate"), variant: "destructive" });
    }
  };

  const handleChangeRole = async (user: ApiUser, newRole: string) => {
    try {
      await apiClient.put(`/api/admin/sa/users/${user.id}/role`, { role: newRole });
      toast({ title: t("messages.changedRole", { name: user.name, role: getRoleDisplayLabel(newRole) }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToChangeRole"), variant: "destructive" });
    }
  };

  const handleSendPasswordReset = async (user: ApiUser) => {
    if (!(await confirmDialog({ title: t("dialogs.userManagement.sendPasswordResetTitle"), description: t("messages.confirmPasswordReset", { name: user.name, email: user.email }), confirmText: t("dialogs.userManagement.sendPasswordResetConfirm") }))) return;
    try {
      await apiClient.post(`/api/admin/sa/users/${user.id}/password-reset`, {});
      toast({ title: t("messages.passwordResetSent", { email: user.email }) });
    } catch {
      toast({ title: t("errors.failedToSendPasswordReset"), variant: "destructive" });
    }
  };

  const handleHealResumes = async (user: ApiUser) => {
    if (user.resumeCount === 0) return;
    if (!(await confirmDialog({ title: t("dialogs.userManagement.healResumesTitle"), description: t("messages.confirmHealResumes", { count: user.resumeCount, name: user.name }), confirmText: t("dialogs.userManagement.healResumesConfirm") }))) return;
    try {
      setHealingUserId(user.id);
      const res = await apiClient.post<{
        total: number;
        healed: number;
        clean: number;
        failed: number;
        failures: Array<{ resumeId: string; title: string; issues: Array<{ path: string; message: string }> }>;
      }>(`/api/admin/sa/users/${user.id}/resumes/heal`, {});
      const { total, healed, clean, failed, failures } = res.data;
      toast({
        title: t("messages.healCompleteFor", { name: user.name }),
        description:
          t("messages.healSummary", { healed, clean, failed, total }) +
          (failed > 0 ? t("messages.healSeeConsole") : ""),
      });
      if (failed > 0) console.warn("[admin] resume heal failures:", failures);
      refresh();
    } catch (err) {
      toast({
        title: t("errors.healFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
        variant: "destructive",
      });
    } finally {
      setHealingUserId(null);
    }
  };

  const handleResetTokens = async (user: ApiUser) => {
    if (!(await confirmDialog({ title: t("dialogs.userManagement.resetTokensTitle"), description: t("messages.confirmResetTokens", { name: user.name }), confirmText: t("dialogs.userManagement.resetTokensConfirm") }))) return;
    try {
      const res = await apiClient.post<{ tokensReset: number }>(
        `/api/admin/sa/users/${user.id}/tokens/reset`,
        {},
      );
      toast({ title: t("messages.tokensResetCount", { count: res.data.tokensReset.toLocaleString(), name: user.name }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToResetTokens"), variant: "destructive" });
    }
  };

  const handleClearOverride = async (user: ApiUser) => {
    const original = user.planOverride?.originalPlanName ?? t("admin.userManagement.theirSubscriptionPlan");
    if (!(await confirmDialog({ title: t("dialogs.userManagement.clearOverrideTitle"), description: t("messages.confirmClearOverride", { name: user.name, plan: original }), confirmText: t("dialogs.userManagement.clearOverrideConfirm") }))) return;
    try {
      await clearPlanOverride(user.id);
      toast({ title: t("messages.userResetTo", { name: user.name, plan: original }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToClearOverride"), variant: "destructive" });
    }
  };

  const handleToggleStatus = async (user: ApiUser) => {
    const newStatus = isUserActive(user) ? "suspended" : "active";
    try {
      await apiClient.put(`/api/admin/sa/users/${user.id}/status`, { status: newStatus });
      toast({ title: newStatus === "suspended" ? t("messages.userSuspended", { name: user.name }) : t("messages.userReactivated", { name: user.name }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToUpdateStatusUser"), variant: "destructive" });
    }
  };

  // Toggle the editorial / house-author flag (is_system). SuperAdmin-only —
  // the menu item is hidden for non-SA, and the server re-checks via the
  // superAdminMiddleware on /api/admin/sa.
  const handleToggleSystem = async (user: ApiUser) => {
    const next = !user.isSystem;
    try {
      await apiClient.put(`/api/admin/sa/users/${user.id}/system`, { isSystem: next });
      toast({
        title: next
          ? t("messages.userMarkedEditorial", { name: user.name })
          : t("messages.userUnmarkedEditorial", { name: user.name }),
      });
      refresh();
    } catch {
      toast({ title: t("errors.failedToUpdateEditorial"), variant: "destructive" });
    }
  };

  return {
    healingUserId,
    handleImpersonate,
    handleChangeRole,
    handleSendPasswordReset,
    handleHealResumes,
    handleResetTokens,
    handleClearOverride,
    handleToggleStatus,
    handleToggleSystem,
  };
}
