import { Brain, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAI } from "@/lib/ai-context";
import { isStudioEditorPath } from "@/lib/studio/studio-routes";
import { cn } from "@/lib/utils";

interface FloatingAIButtonProps {
  className?: string;
}

export default function FloatingAIButton({ className }: FloatingAIButtonProps) {
  const { openAIChat, isAIChatOpen, hasDockedChat } = useAI();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [isHovered, setIsHovered] = useState(false);

  // Only ONE Brain on screen: hide while the AI panel is already open, while
  // a page docks its own in-page chat (useDockedAIChat — e.g. the kit workspace), and on
  // the Studio editor, which hosts the AI in its left-panel AI tab (the
  // launcher would only cover the canvas there).
  if (isAIChatOpen || hasDockedChat || isStudioEditorPath(pathname)) return null;

  const label = t("aiChat.floating.title");

  return (
    <div data-print-hide className={cn("fixed bottom-24 right-6 z-40 md:bottom-6 print:hidden", className)}>
      <Button
        onClick={openAIChat}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        aria-label={label}
        className="group h-14 w-14 rounded-full bg-primary shadow-lg transition-all duration-300 hover:bg-primary/90 hover:shadow-xl"
        size="icon"
      >
        <div className="relative">
          <Brain className="h-6 w-6 text-primary-foreground transition-transform duration-300 group-hover:scale-110" />
          <Sparkles
            className={cn(
              "absolute -right-1 -top-1 h-3 w-3 text-primary-foreground/80 transition-all duration-300",
              isHovered ? "scale-110 animate-pulse" : "",
            )}
          />
        </div>
      </Button>

      {/* Tooltip */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute bottom-16 right-0 whitespace-nowrap rounded-lg border bg-background px-3 py-2 shadow-lg transition-all duration-300",
          isHovered ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{t("aiChat.floating.subtitle")}</div>
        <div className="absolute right-4 top-full h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border" />
      </div>
    </div>
  );
}
