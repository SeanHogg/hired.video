/**
 * Pro gate for effect-panel actions — adding a Pro effect, animating a
 * param with keyframes (#282). ONE toast + upgrade CTA so every Pro
 * effect action reads the same. Returns `allow(label)`: true when the user
 * may proceed, false after showing the upgrade toast.
 */
"use client";

import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { toast } from "@/hooks/use-toast";

export function useProEffectGate(): { isPro: boolean; allow: (label: string) => boolean } {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isPro } = useSubscription();
  const allow = React.useCallback(
    (label: string): boolean => {
      if (isPro) return true;
      toast({
        title: t("studio.effects.proToastTitle", { label }),
        description: t("studio.effects.proToastDescription"),
        action: (
          <Button size="sm" variant="default" onClick={() => navigate("/pricing")}>
            {t("studio.effects.upgrade")}
          </Button>
        ) as React.ReactElement,
      });
      return false;
    },
    [isPro, navigate, t],
  );
  return { isPro, allow };
}
