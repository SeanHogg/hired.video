// Active-lesson body for /learn/:enrollmentId. One switch on sourceType —
// every lesson kind self-renders without capability flags drilled through
// the page.

import { useMemo, useState } from "react";
import { publicVideoPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { ExternalLink, Lock } from "lucide-react";
import Markdown from "@/components/Markdown";
import ScormPlayer from "@/components/courses/ScormPlayer";
import TextNarrator from "@/components/audio/TextNarrator";
import MonoChip from "@/components/templates/MonoChip";
import { PROSE_CLASS } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";
import type { CourseLesson } from "@/lib/services/course-service";

const WARNING_BOX =
  "flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300";

export default function LessonBody({
  lesson,
  enrollmentId,
  courseId,
  themeTokens,
  onScormCompleted,
}: {
  lesson: CourseLesson;
  enrollmentId: string;
  courseId: string;
  themeTokens?: Record<string, string>;
  onScormCompleted: () => void;
}) {
  const { t } = useTranslation();
  switch (lesson.sourceType) {
    case "text_md":
      // #1782 — a text_md lesson can also carry a companion video; the
      // shared Read/Watch component decides its own toggle visibility.
      return <ReadWatchLesson lesson={lesson} defaultTab="read" />;

    case "scorm_package":
      if (!lesson.scormEntryUrl || !lesson.scormVersion) {
        return (
          <div className="p-5">
            <div className={WARNING_BOX}>
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("messages.courseLearner.scormNotConfigured")}
            </div>
          </div>
        );
      }
      return (
        <ScormPlayer
          enrollmentId={enrollmentId}
          lessonId={lesson.id}
          scormVersion={lesson.scormVersion}
          scormEntryUrl={lesson.scormEntryUrl}
          courseId={courseId}
          onCompleted={onScormCompleted}
          className="h-[70vh]"
          themeTokens={themeTokens}
        />
      );

    case "studio_video":
      if (!lesson.studioProjectId) {
        return <div className="p-6 text-sm italic text-muted-foreground">{t("messages.courseLearner.noStudioProject")}</div>;
      }
      // #1782 — a studio_video lesson can also carry a readable body; the
      // shared Read/Watch component defaults a video lesson to "watch".
      return <ReadWatchLesson lesson={lesson} defaultTab="watch" />;

    case "external_url":
      if (!lesson.externalUrl) {
        return <div className="p-6 text-sm italic text-muted-foreground">{t("messages.courseLearner.noUrlProvided")}</div>;
      }
      return <ExternalUrlLesson lesson={lesson} />;

    default:
      return null;
  }
}

/**
 * #1782 — shared Read / Watch surface. Decides its OWN visibility: when a
 * lesson carries BOTH a readable body and a video source it shows a small
 * two-tab toggle; with a single modality it renders that modality alone.
 *
 * Video source (#1464): prefer the published `studioSlug` for the /v/ embed
 * so share links + analytics use the slug; fall back to the raw project id.
 */
function ReadWatchLesson({ lesson, defaultTab }: { lesson: CourseLesson; defaultTab: "read" | "watch" }) {
  const { t } = useTranslation();
  const videoRef = lesson.studioSlug || lesson.studioProjectId;
  const hasBody = !!lesson.bodyMd;
  const hasVideo = !!videoRef;
  const [tab, setTab] = useState<"read" | "watch">(defaultTab);

  const readView = (
    <div className="flex flex-col gap-4">
      {lesson.bodyMd ? (
        <>
          <TextNarrator text={lesson.bodyMd} preferenceKey="learn.lesson-narration" variant="inline" />
          {/* Shared <Markdown> resolves API-relative image srcs (e.g. the
              /api/og/lesson-diagram diagrams embedded by migration 0190). */}
          <Markdown className={PROSE_CLASS}>{lesson.bodyMd}</Markdown>
        </>
      ) : (
        <p className="italic text-muted-foreground">{t("messages.courseLearner.noContentYet")}</p>
      )}
    </div>
  );

  const watchView = videoRef ? (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-ink">
      <iframe
        src={publicVideoPath(videoRef)}
        title={lesson.title}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
      />
    </div>
  ) : (
    <div className="text-sm italic text-muted-foreground">{t("messages.courseLearner.noStudioProject")}</div>
  );

  // Single-modality lessons render directly — no toggle.
  if (hasBody && !hasVideo) return <div className="mx-auto w-full max-w-[740px] px-5 py-6">{readView}</div>;
  if (hasVideo && !hasBody) return <div className="p-4">{watchView}</div>;

  const toggle = (id: "read" | "watch", label: string) => (
    <button
      type="button"
      aria-pressed={tab === id}
      className={cn(
        "min-h-[40px] rounded-lg px-4 text-sm font-semibold transition-colors",
        tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="inline-flex gap-1 self-start rounded-xl bg-muted p-1">
        {toggle("read", t("actions.courseLearner.read"))}
        {toggle("watch", t("actions.courseLearner.watch"))}
      </div>
      {tab === "read" ? <div className="mx-auto w-full max-w-[740px]">{readView}</div> : watchView}
    </div>
  );
}

/**
 * #1463 — external_url lessons embedded in a sandboxed iframe. Requires
 * HTTPS (refuses to embed plaintext-http origins, showing a warning +
 * open-in-new-tab link instead) and shows a "Hosted at <domain>" chip so
 * the learner can see where the content comes from.
 */
function ExternalUrlLesson({ lesson }: { lesson: CourseLesson }) {
  const { t } = useTranslation();
  const url = lesson.externalUrl ?? "";

  // Parse once; guard against malformed URLs so a bad row never throws.
  const parsed = useMemo(() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }, [url]);

  const isHttps = parsed?.protocol === "https:";
  const hostname = parsed?.hostname ?? null;

  const openLink = (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
    >
      {t("actions.courseLearner.openInNewTab")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );

  if (!isHttps) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className={WARNING_BOX}>
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t("messages.courseLearner.externalUrlNotSecure")}
          </span>
        </div>
        {openLink}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {hostname && (
        <MonoChip className="inline-flex items-center gap-1 self-start">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {t("labels.courseLearner.hostedAt", { domain: hostname })}
        </MonoChip>
      )}
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted">
        <iframe
          src={url}
          title={lesson.title}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
      {openLink}
    </div>
  );
}
