/**
 * The manual-upload card a studio Save menu sends you to (#2048): a format
 * whose destination forbids direct posting (a comic's Webtoon / Tapas row)
 * opens /studio/distribution?project=<id>&manual=<destination>. Renders
 * nothing unless both are present and valid.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { studioService } from "@/lib/services/studio-service";
import { isManualUploadDestination } from "@shared/manual-upload";
import { UUID_LIKE_REGEX } from "@shared/validation";
import ManualUploadCard from "./ManualUploadCard";

export default function ManualUploadFromLink() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const projectId = params.get("project") ?? "";
  const destination = params.get("manual") ?? "";
  const valid = UUID_LIKE_REGEX.test(projectId) && isManualUploadDestination(destination);
  const q = useQuery({
    queryKey: ["studio", "project", projectId],
    queryFn: async () => (await studioService.getProject(projectId)).data,
    enabled: valid,
  });
  if (!valid || !isManualUploadDestination(destination) || !q.data) return null;
  return (
    <div className="mb-6 flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t("distribution.manual.forProject", { title: q.data.title || t("distribution.compose.untitled") })}</p>
      <ManualUploadCard
        projectId={projectId}
        destination={destination}
        downloadUrl={q.data.videoUrl}
        editorHref={`/studio/${projectId}`}
      />
    </div>
  );
}
