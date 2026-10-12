/**
 * The assistant's line after a chat revision: names WHAT changed ("Done — I
 * changed your summary and headline"), so an unexpected edit is visible
 * instead of hiding behind a bare "Done". Areas are the server's
 * `ChangedArea`s (JSON Resume section keys plus headline / summary).
 */
import { useTranslation } from "react-i18next";

const AREA_LABEL_KEYS: Record<string, string> = {
  headline: "build.chat.area.headline",
  summary: "build.chat.area.summary",
  basics: "build.chat.area.basics",
  work: "build.chat.area.work",
  education: "build.chat.area.education",
  skills: "build.chat.area.skills",
  projects: "build.chat.area.projects",
  volunteer: "build.chat.area.volunteer",
  awards: "build.chat.area.awards",
  certificates: "build.chat.area.certificates",
  publications: "build.chat.area.publications",
  languages: "build.chat.area.languages",
  interests: "build.chat.area.interests",
  references: "build.chat.area.references",
  video: "build.chat.area.video",
};

export default function RevisedMessage({ changed }: { changed: readonly string[] }) {
  const { t } = useTranslation();
  if (changed.length === 0) return <>{t("build.chat.revisedNothing")}</>;
  const areas = [...new Set(changed.map((a) => t(AREA_LABEL_KEYS[a] ?? "build.chat.area.other")))].join(", ");
  return <>{t("build.chat.revisedAreas", { areas })}</>;
}
