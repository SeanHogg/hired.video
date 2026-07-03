// eslint-page-chrome: skip — bare embed page rendered inside a partner iframe;
// intentionally ships no AppShell / nav / SEO chrome (mirrors EmbeddedResume).
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { DEFAULT_DESCRIPTOR, getTemplateById } from "@/types/resume-template";
import {
  partnerConnectionService,
  type PartnerEmbedPayload,
} from "@/lib/services/partner-connection-service";

/**
 * Partner-embedded profile. Rendered INSIDE an iframe on a partner's site via a
 * keyless token, so it is deliberately minimal — no AppShell, nav, or platform
 * chrome (mirrors EmbeddedResume). Route: /embedded/profile/:token.
 */
export default function EmbeddedPartnerProfile() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [payload, setPayload] = useState<PartnerEmbedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    partnerConnectionService
      .resolveEmbed(token)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">{t("partnerEmbed.loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="mb-3 text-2xl font-bold text-foreground">
            {t("partnerEmbed.unavailableTitle")}
          </h1>
          <p className="text-muted-foreground">{t("partnerEmbed.unavailableBody")}</p>
        </div>
      </div>
    );
  }

  const { user, resume } = payload;
  const displayName = user.name || user.handle || "";
  const initials = displayName
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
        {/* Compact profile header */}
        <div className="mb-6 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
          <Avatar className="h-20 w-20 border">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="text-lg font-semibold">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            {displayName ? (
              <h1 className="truncate text-2xl font-bold text-foreground">{displayName}</h1>
            ) : null}
            {user.headline ? (
              <p className="text-muted-foreground">{user.headline}</p>
            ) : null}
            {user.location ? (
              <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground sm:justify-start">
                <MapPin className="h-3.5 w-3.5" />
                {user.location}
              </p>
            ) : null}
          </div>
        </div>

        {/* Resume via the declarative template engine (embedded mode). */}
        {resume ? (
          <DeclarativeResumeRenderer
            resume={resume}
            descriptor={
              getTemplateById(resume.content?.meta?.embeddedTemplate) ??
              getTemplateById(resume.content?.meta?.template) ??
              DEFAULT_DESCRIPTOR
            }
            embedded
          />
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">{t("partnerEmbed.noResume")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer attribution */}
      <footer className="mt-12 border-t bg-card/50 backdrop-blur-sm">
        <div className="px-4 py-5">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>{t("partnerEmbed.poweredBy")}</span>
            <a
              href="https://hired.video"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <span>hired.video</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
