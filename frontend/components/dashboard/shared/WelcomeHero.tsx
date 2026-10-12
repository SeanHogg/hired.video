import React, { useState } from "react";
import { Film, Chrome, Sparkles, ArrowRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DISMISS_KEY = "welcome_hero_dismissed_v1";

export function WelcomeHero() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <Card className="relative border-2 border-primary/30 overflow-hidden bg-muted/50">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded hover:bg-muted text-muted-foreground transition-colors z-10"
        title={t("labels.dismiss")}
      >
        <X className="h-4 w-4" />
      </button>
      <CardHeader className="pb-3 pr-10">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-primary" />
          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
            {t("labels.welcomeBadge")}
          </Badge>
        </div>
        <CardTitle className="text-2xl sm:text-3xl">
          {t("headings.firstWinFiveMinutes")}
        </CardTitle>
        <CardDescription className="text-base">
          {t("messages.firstWinIntro")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Path 1: Create a Video */}
          <Link
            to="/studio"
            className="group block p-5 rounded-lg bg-card border-2 border-primary/30 hover:border-primary hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-3 group-hover:bg-accent transition-colors">
              <Film className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-base mb-1">
              {t("headings.createMarketingVideoStep")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("messages.createMarketingVideoStepDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
              {t("actions.openStudio")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </Link>

          {/* Path 2: Install Chrome Extension */}
          <Link
            to="/chrome-extension"
            className="group block p-5 rounded-lg bg-card border border-border hover:border-brand-green/60 hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-brand-green/15 flex items-center justify-center mb-3 transition-colors">
              <Chrome className="h-6 w-6 text-brand-green-text" />
            </div>
            <h3 className="font-semibold text-base mb-1">
              {t("headings.findJobsFasterStep")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("messages.findJobsFasterStepDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-brand-green-text group-hover:gap-2 transition-all">
              {t("actions.installExtension")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </Link>

          {/* Path 3: Earn as a Creator */}
          <Link
            to="/services"
            className="group block p-5 rounded-lg bg-card border-2 border-primary/30 hover:border-primary hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-3 group-hover:bg-accent transition-colors">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-base mb-1">
              {t("headings.earnAsCreatorStep")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("messages.earnAsCreatorStepDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
              {t("actions.startEarning")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default WelcomeHero;
