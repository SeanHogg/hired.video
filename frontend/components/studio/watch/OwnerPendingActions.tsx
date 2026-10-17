/**
 * OwnerPendingActions — on the watch page's "still preparing" panel, the
 * project's OWNER gets Publish (makes it public, which is what makes the
 * link play — no render needed, and the profile video is left alone) and
 * Edit, instead of the dead end a visitor sees. Renders nothing for anyone
 * else: ownership is the authed project read, which 404s for a caller who
 * can't act for the project.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { studioService } from "@/lib/services/studio-service";

export function OwnerPendingActions({ projectId, onPublished }: { projectId: string; onPublished: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setIsOwner(false);
    if (!user) return;
    let live = true;
    studioService
      .getProject(projectId)
      .then((res) => live && setIsOwner(!!res.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId, user]);

  if (!isOwner) return null;

  const publish = async () => {
    setPublishing(true);
    try {
      await studioService.updateProjectVisibility(projectId, true);
      onPublished();
    } catch (err) {
      toast({
        title: t("messages.publishFailedTitle"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">{t("seoLanding.publicVideo.ownerHint")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button className="min-h-[44px]" onClick={() => void publish()} disabled={publishing}>
          {publishing ? t("seoLanding.publicVideo.publishing") : t("seoLanding.publicVideo.publishNow")}
        </Button>
        <Button asChild variant="outline" className="min-h-[44px]">
          <Link to={`/studio/${encodeURIComponent(projectId)}`}>{t("seoLanding.publicVideo.editInStudio")}</Link>
        </Button>
      </div>
    </div>
  );
}
