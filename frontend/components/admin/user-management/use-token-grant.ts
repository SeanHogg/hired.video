import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api-client";
import type { ApiUser } from "./types";

/** Grant-tokens dialog state + submit. */
export function useTokenGrant(refresh: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [grantTarget, setGrantTarget] = useState<ApiUser | null>(null);
  const [grantTokens, setGrantTokens] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [granting, setGranting] = useState(false);

  const openGrant = (user: ApiUser) => {
    setGrantTarget(user);
    setGrantTokens("");
    setGrantReason("");
  };

  const closeGrant = () => setGrantTarget(null);

  const submitGrant = async () => {
    if (!grantTarget) return;
    const tokens = Number(grantTokens);
    if (!Number.isInteger(tokens) || tokens <= 0) {
      toast({ title: t("errors.enterPositiveInteger"), variant: "destructive" });
      return;
    }
    try {
      setGranting(true);
      await apiClient.post(
        `/api/admin/sa/users/${grantTarget.id}/tokens/grant`,
        { tokens, reason: grantReason || undefined },
      );
      toast({ title: t("messages.grantedTokensCount", { count: tokens.toLocaleString(), name: grantTarget.name }) });
      setGrantTarget(null);
      refresh();
    } catch {
      toast({ title: t("errors.failedToGrantTokens"), variant: "destructive" });
    } finally {
      setGranting(false);
    }
  };

  return {
    grantTarget,
    grantTokens,
    setGrantTokens,
    grantReason,
    setGrantReason,
    granting,
    openGrant,
    closeGrant,
    submitGrant,
  };
}
