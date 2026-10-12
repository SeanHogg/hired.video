import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { API_ERROR_EVENT, type ApiErrorEvent } from "@shared/errors/apiErrorEvent";
import { useToast } from "@/hooks/use-toast";
import {
  EXPLICIT_CONTENT_CODE,
  explicitContentMessage,
  explicitInfoFrom,
} from "@/lib/moderation/explicit-content-error";

/**
 * One localized notice for every 422 `EXPLICIT_CONTENT` (explicit-content
 * gate): image uploads, profile saves, video-personalization saves, and any
 * future surface — no per-caller wiring. Names the category (localized from
 * the ids the API sends), never the offending content. `<GlobalErrorHandler>`
 * skips this code so it isn't shown as a fault with "report this error".
 * Mounted at the App root next to <GlobalErrorHandler>.
 */
export default function GlobalExplicitContentNotice() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: CustomEvent<ApiErrorEvent>) => {
      if (e.detail.code !== EXPLICIT_CONTENT_CODE) return;
      toast({
        title: t("moderation.blocked.title"),
        description: explicitContentMessage(
          explicitInfoFrom(e.detail.details),
          (key, options) => String(t(key, options)),
          i18n.language,
        ),
        variant: "destructive",
      });
    };
    window.addEventListener(API_ERROR_EVENT, handler as EventListener);
    return () => window.removeEventListener(API_ERROR_EVENT, handler as EventListener);
  }, [t, i18n.language, toast]);

  return null;
}
