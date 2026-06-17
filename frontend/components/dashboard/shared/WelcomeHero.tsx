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
    <Card className="relative border-2 border-primary/30 bg-gradient-to-br from-blue-50 via-white to-purple-50 overflow-hidden">
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
            className="group block p-5 rounded-lg bg-card border-2 border-blue-200 hover:border-blue-500 hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
              <Film className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-base mb-1">
              {t("headings.createMarketingVideoStep")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("messages.createMarketingVideoStepDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-blue-600 group-hover:gap-2 transition-all">
              {t("actions.openStudio")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </Link>

          {/* Path 2: Install Chrome Extension */}
          <Link
            to="/chrome-extension"
            className="group block p-5 rounded-lg bg-card border-2 border-green-200 hover:border-green-500 hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
              <Chrome className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-base mb-1">
              {t("headings.findJobsFasterStep")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("messages.findJobsFasterStepDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-green-600 group-hover:gap-2 transition-all">
              {t("actions.installExtension")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </Link>

          {/* Path 3: Earn as a Creator */}
          <Link
            to="/services"
            className="group block p-5 rounded-lg bg-card border-2 border-purple-200 hover:border-purple-500 hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-base mb-1">
              {t("headings.earnAsCreatorStep")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("messages.earnAsCreatorStepDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-purple-600 group-hover:gap-2 transition-all">
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
