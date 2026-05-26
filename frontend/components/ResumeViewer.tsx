import {
  Eye,
  Share2,
  Copy,
  Star,
  Users,
  Lock,
  Globe,
  Calendar,
  Mail,
  Phone,
  ExternalLink,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ItemMediaStrip from "./ItemMediaStrip";
import HighlightsList from "./HighlightsList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Resume,
  ResumePrivacy,
  UpdateResumeRequest,
  ResumeSectionMeta,
} from "@/types/resume";
import { MetaType } from "@/types/resume";



interface ResumeViewerProps {
  resume: Resume;
  onUpdate: (_request: UpdateResumeRequest) => void;
  onCreateVariation?: (_parentId: string) => void;
  canEdit?: boolean;
  showToolbar?: boolean; // show internal action toolbar (name, privacy, share, edit)
  selectedMediaId?: string | null; // ID of media to highlight/scroll to
}

export default function ResumeViewer({
  resume,
  onUpdate,
  onCreateVariation,
  canEdit = true,
  showToolbar = true,
  selectedMediaId,
}: ResumeViewerProps) {
  const { t } = useTranslation();
  const [privacy, setPrivacy] = useState<ResumePrivacy>(resume?.privacy || "private");
  const [showShareAlert, setShowShareAlert] = useState(false);

  // Featured Video from metadata (match ResumeDetail behavior) - moved before early returns
  const videoMetaItems = useMemo<ResumeSectionMeta[]>(() => {
    const all = resume?.content?.metaData || [];
    const videoTypes = new Set<MetaType>([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
    return all.filter((m) => videoTypes.has(m.metaType));
  }, [resume?.content?.metaData]);
  const [videoIndex, setVideoIndex] = useState<number>(0);
  useEffect(() => {
    if (videoIndex >= videoMetaItems.length) setVideoIndex(0);
  }, [videoMetaItems.length, videoIndex]);

  // Handle selectedMediaId to automatically select the appropriate video and scroll to section - moved before early returns
  useEffect(() => {
    if (selectedMediaId && resume?.content?.metaData) {
      // Find the media item
      const mediaItem = resume.content.metaData.find(m => m.id === selectedMediaId || m.referenceId === selectedMediaId);
      if (mediaItem) {
        // If it's a video type, set the video index
        const videoTypes = new Set<MetaType>([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
        if (videoTypes.has(mediaItem.metaType)) {
          const index = videoMetaItems.findIndex(v => v.id === mediaItem.id || v.referenceId === mediaItem.referenceId);
          if (index >= 0) setVideoIndex(index);
        }

        // Scroll to the section containing this media
        setTimeout(() => {
          const element = document.getElementById(`media-${selectedMediaId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }, [selectedMediaId, resume?.content?.metaData, videoMetaItems]);

  // Safety check for resume data
  if (!resume) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">{t("resumeViewer.error.dataTitle")}</h2>
        <p className="text-muted-foreground">{t("resumeViewer.error.dataBody")}</p>
      </div>
    );
  }

  // Additional safety checks
  if (!resume.content) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">{t("resumeViewer.error.contentTitle")}</h2>
        <p className="text-muted-foreground">{t("resumeViewer.error.contentBody")}</p>
      </div>
    );
  }

  // Ensure resume.content exists and has required structure
  const resumeData = resume.content || {
    basics: {
      name: "",
      label: "",
      image: "",
      email: "",
      phone: "",
      url: "",
      summary: "",
      location: null,
    },
    work: [],
    education: [],
    skills: [],
    volunteer: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [],
    interests: [],
    references: [],
    projects: [],
    metaData: [],
  };

  const handlePrivacyChange = (newPrivacy: ResumePrivacy) => {
    setPrivacy(newPrivacy);
    onUpdate({ privacy: newPrivacy });
  };



  const handleShare = () => {
    const shareUrl = `${window.location.origin}/resumes/${resume.id}`;
    navigator.clipboard.writeText(shareUrl);
    setShowShareAlert(true);
    setTimeout(() => setShowShareAlert(false), 3000);
  };

  // Date formatting to match ResumeDetail: MMM YYYY, hide when both missing, show end-only if start missing
  // Accepts common resume date shapes: "Present", ISO ("2020-01", "2020-01-15", "2020"),
  // US short ("01/2020", "1/2020"), long ("January 2020", "Jan 2020"), and bare year ("2020").
  const formatMMMYYYY = (dateString: string): string => {
    const raw = (dateString || "").trim();
    if (!raw) return "";
    if (/^present$/i.test(raw) || /^current$/i.test(raw) || /^now$/i.test(raw)) return t("labels.present");

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // "MM/YYYY" or "M/YYYY"
    const slashMatch = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const m = parseInt(slashMatch[1], 10);
      if (m >= 1 && m <= 12) return `${MONTHS[m - 1]} ${slashMatch[2]}`;
    }

    // "YYYY-MM" or "YYYY-MM-DD"
    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
    if (isoMatch) {
      const m = parseInt(isoMatch[2], 10);
      if (m >= 1 && m <= 12) return `${MONTHS[m - 1]} ${isoMatch[1]}`;
    }

    // Bare year
    if (/^\d{4}$/.test(raw)) return raw;

    // Fallback: native Date parsing (handles "January 2020", "Jan 2020", full ISO, etc.)
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    }
    return raw; // Last resort — render as-is so data isn't silently dropped
  };

  const getDateText = (startDate?: string, endDate?: string, treatMissingEndAsPresent = false): string | null => {
    const start = formatMMMYYYY(startDate || "");
    let end = formatMMMYYYY(endDate || "");
    if (!end && treatMissingEndAsPresent) end = t("labels.present");

    if (!start && !end) return null;
    if (!start && end) return end;
    if (start && !end) return start;
    return `${start} - ${end}`;
  };

  const getPrivacyIcon = (privacy: ResumePrivacy) => {
    switch (privacy) {
      case "public":
        return <Globe className="h-4 w-4" />;
      case "recruiter_only":
        return <Users className="h-4 w-4" />;
      case "connections":
        return <Users className="h-4 w-4" />;
      case "private":
        return <Lock className="h-4 w-4" />;
      default:
        return <Lock className="h-4 w-4" />;
    }
  };

  const getPrivacyText = (privacy: ResumePrivacy) => {
    switch (privacy) {
      case "public":
        return t("labels.privacy.public");
      case "recruiter_only":
        return t("labels.privacy.recruiterOnly");
      case "connections":
        return t("labels.connections");
      case "private":
        return t("labels.privacy.private");
      default:
        return t("labels.privacy.private");
    }
  };

  const getPrivacyColor = (privacy: ResumePrivacy) => {
    switch (privacy) {
      case "public":
        return "bg-green-100 text-green-800";
      case "recruiter_only":
        return "bg-blue-100 text-blue-800";
      case "connections":
        return "bg-indigo-100 text-indigo-800";
      case "private":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };



  const currentVideoMeta = videoMetaItems.length > 0 ? videoMetaItems[videoIndex] : null;
  const youTubeEmbed = (url: string): string => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.split("/").filter(Boolean)[0];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (u.hostname.includes("youtube.com")) {
        const v = u.searchParams.get("v");
        if (v) return `https://www.youtube.com/embed/${v}`;
        const parts = u.pathname.split("/").filter(Boolean);
        const embedIdx = parts.indexOf("embed");
        if (embedIdx >= 0 && parts[embedIdx + 1]) return `https://www.youtube.com/embed/${parts[embedIdx + 1]}`;
      }
    } catch {
      // Ignore URL parsing errors
    }
    return url;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 p-4 sm:p-0">
      {/* Toolbar (optional) */}
      {showToolbar && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">{resume.title}</h1>
            <div className="flex items-center gap-2">
              {resume.isMaster && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  <Star className="h-3 w-3 mr-1" />
                  Master
                </Badge>
              )}
              <Badge className={getPrivacyColor(privacy)}>
                {getPrivacyIcon(privacy)}
                <span className="ml-1">{getPrivacyText(privacy)}</span>
              </Badge>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {canEdit && (
              <Select value={privacy} onValueChange={handlePrivacyChange}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Private
                    </div>
                  </SelectItem>
                  <SelectItem value="recruiter_only">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Recruiter Only
                    </div>
                  </SelectItem>
                  <SelectItem value="connections">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Connections
                    </div>
                  </SelectItem>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Public
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}

            <Button variant="outline" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>

            {resume.isMaster && onCreateVariation && (
              <Button onClick={() => onCreateVariation(resume.id)}>
                <Copy className="h-4 w-4 mr-2" />
                Create Variation
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Share Success Alert */}
      {showShareAlert && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Resume link copied to clipboard!</AlertDescription>
        </Alert>
      )}

      {/* Resume Preview */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-primary text-primary-foreground p-8">
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold">{resumeData.basics.name}</h1>
              <p className="text-xl opacity-90">{resumeData.basics.label}</p>

              <div className="flex flex-wrap justify-center gap-4 text-sm opacity-80">
                {resumeData.basics.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {resumeData.basics.email}
                  </div>
                )}
                {resumeData.basics.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {resumeData.basics.phone}
                  </div>
                )}
                {resumeData.basics.url && (
                  <div className="flex items-center gap-1">
                    <ExternalLink className="h-4 w-4" />
                    <a
                      href={resumeData.basics.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Portfolio
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-8 space-y-8">
            {/* Featured Video */}
            {currentVideoMeta && (
              <section>
                <div className="relative">
                  <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
                    {/* Prev */}
                    {videoMetaItems.length > 1 && (
                      <button
                        type="button"
                        aria-label={t("resumeViewer.aria.previousVideo")}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
                        onClick={() => setVideoIndex((prev) => (prev - 1 + videoMetaItems.length) % videoMetaItems.length)}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    )}

                    {/* Next */}
                    {videoMetaItems.length > 1 && (
                      <button
                        type="button"
                        aria-label={t("resumeViewer.aria.nextVideo")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
                        onClick={() => setVideoIndex((prev) => (prev + 1) % videoMetaItems.length)}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}

                    {currentVideoMeta.metaType === MetaType.YouTube ? (
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={youTubeEmbed(currentVideoMeta.url)}
                        title={currentVideoMeta.name || t("headings.videoResume")}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video className="absolute inset-0 w-full h-full" controls>
                        <source
                          src={currentVideoMeta.url}
                          type={currentVideoMeta.metaType === MetaType.VideoWebM ? "video/webm" : "video/mp4"}
                        />
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>

                  {/* Footer pills */}
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <div className="text-xs opacity-80">
                      Video {videoIndex + 1} / {videoMetaItems.length}
                    </div>
                    {videoMetaItems.length > 1 && (
                      <div className="flex flex-wrap gap-2 justify-center">
                        {videoMetaItems.map((m, idx) => (
                          <button
                            key={m.id || `${m.referenceId}-${idx}`}
                            type="button"
                            className={`px-2 py-1 rounded text-xs border ${idx === videoIndex ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/30 text-foreground border-border"}`}
                            onClick={() => setVideoIndex(idx)}
                          >
                            {m.name || `Video ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Summary */}
            {resumeData.basics.summary && (
              <section>
                <h2 className="text-2xl font-bold mb-4">{t("fields.summary.label")}</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {resumeData.basics.summary}
                </p>
              </section>
            )}

            {/* Basics Metadata */}
            <section data-section-id={resumeData.basics.id}>
              <ItemMediaStrip
                itemId={resumeData.basics.id}
                metaData={resume.content.metaData}
                variant="pills"
                className="mt-0"
              />
            </section>

            {/* Work Experience */}
            {resumeData.work.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t("headings.workExperience")}</h2>
                <div className="space-y-6">
                  {resumeData.work
                    .slice()
                    .sort((a, b) => {
                      const norm = (s?: string) => (s || '').trim().toLowerCase();
                      // Current positions (no end date or 'present') come first
                      const aEnd = norm(a.endDate);
                      const bEnd = norm(b.endDate);
                      const aIsCurrent = aEnd === '' || aEnd === 'present';
                      const bIsCurrent = bEnd === '' || bEnd === 'present';

                      if (aIsCurrent && !bIsCurrent) return -1;
                      if (!aIsCurrent && bIsCurrent) return 1;

                      // For positions with end dates, sort by end date descending (most recent first)
                      if (!aIsCurrent && !bIsCurrent) {
                        const aEndDate = new Date(a.endDate || a.startDate);
                        const bEndDate = new Date(b.endDate || b.startDate);
                        if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) return 0;
                        return bEndDate.getTime() - aEndDate.getTime();
                      }

                      // For current positions, sort by start date descending (most recent first)
                      const aStartDate = new Date(a.startDate);
                      const bStartDate = new Date(b.startDate);
                      if (isNaN(aStartDate.getTime()) || isNaN(bStartDate.getTime())) return 0;
                      return bStartDate.getTime() - aStartDate.getTime();
                    })
                    .map((work, index) => (
                    <div
                      key={index}
                      className="border-l-2 border-primary/20 pl-6 relative"
                      data-section-id={work.id}
                    >
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-2 top-2" />
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <h3 className="text-lg font-semibold">
                            {work.position}
                          </h3>
                          {getDateText(work.startDate, work.endDate, true) && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>{getDateText(work.startDate, work.endDate, true)}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-primary font-medium">{work.name}</p>

	                    <ItemMediaStrip
	                      itemId={work.id}
	                      metaData={resume.content.metaData}
	                      variant="pills"
	                    />

                        {work.summary && (
                          <p className="text-muted-foreground">
                            {work.summary}
                          </p>
                        )}
                        <HighlightsList highlights={work.highlights} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Education */}
            {resumeData.education.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t("headings.education")}</h2>
                <div className="space-y-4">
                  {resumeData.education.map((edu, index) => (


                    <div key={index} className="border rounded-lg p-4" data-section-id={edu.id}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">
                            {edu.studyType} in {edu.area}
                          </h3>
                          <p className="text-primary">{edu.institution}</p>
                          {edu.score && (
                            <p className="text-sm text-muted-foreground">
                              GPA: {edu.score}
                            </p>
                          )}
                        </div>
                        {getDateText(edu.startDate, edu.endDate) && (
                          <div className="text-sm text-muted-foreground">
                            {getDateText(edu.startDate, edu.endDate)}
                          </div>
                        )}
                        <ItemMediaStrip
                          itemId={edu.id}
                          metaData={resume.content.metaData}
                          variant="pills"
                        />

                      </div>
                    </div>


                  ))}
                </div>
              </section>
            )}

              {/* Volunteer Experience */}
              {resumeData.volunteer.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("headings.volunteerExperience")}</h2>
                  <div className="space-y-4">
                    {resumeData.volunteer
                      .slice()
                      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                      .map((volunteer, index) => (
                        <div key={index} className="border rounded-lg p-4" data-section-id={volunteer.id}>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <h3 className="font-semibold">{volunteer.position}</h3>
                              <p className="text-primary">{volunteer.organization}</p>
                              {volunteer.summary && (
                                <p className="text-sm text-muted-foreground">{volunteer.summary}</p>
                              )}
                            </div>
                            {getDateText(volunteer.startDate, volunteer.endDate, true) && (
                              <div className="text-sm text-muted-foreground">
                                {getDateText(volunteer.startDate, volunteer.endDate, true)}
                              </div>
                            )}
                          </div>

                          <HighlightsList highlights={volunteer.highlights} />

                          <ItemMediaStrip
                            itemId={volunteer.id}
                            metaData={resume.content.metaData}
                            variant="pills"
                          />
                        </div>
                      ))}
                  </div>
                </section>
              )}


            {/* Skills */}
            {resumeData.skills.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t("headings.skills")}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {resumeData.skills.map((skill, index) => (
                    <div key={index} className="flex flex-col gap-2 p-3 border rounded-lg" data-section-id={skill.id}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{skill.name}</span>
                        <Badge variant="secondary">{skill.level}</Badge>
                      </div>
                      {skill.keywords && skill.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.keywords.map((keyword, keywordIndex) => (
                            <span
                              key={keywordIndex}
                              className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                      <ItemMediaStrip
                        itemId={skill.id}
                        metaData={resume.content.metaData}
                        variant="pills"
                        className="mt-0"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </CardContent>
      </Card>


              {/* Projects */}
              {resumeData.projects.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("headings.projects")}</h2>
                  <div className="space-y-6">
                    {resumeData.projects.map((project, index) => (
                      <div key={index} className="border-b pb-6 last:border-b-0 last:pb-0" data-section-id={project.id}>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg">{project.name}</h3>
                          {project.url && (
                            <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        {(project.startDate || project.endDate) && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {getDateText(project.startDate, project.endDate, true)}
                          </p>
                        )}
                        {project.entity && (
                          <p className="text-sm text-muted-foreground mb-2">{project.entity}</p>
                        )}
                        {project.description && <p className="text-sm mb-3">{project.description}</p>}
                        <HighlightsList
                          highlights={project.highlights}
                          className="list-disc list-inside text-sm mb-3 space-y-1"
                        />
                        <ItemMediaStrip
                          itemId={project.id}
                          metaData={resume.content.metaData}
                          variant="pills"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Awards */}
              {resumeData.awards.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("tabs.awards")}</h2>
                  <div className="space-y-4">
                    {resumeData.awards.map((award, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{award.title}</h3>
                            <p className="text-sm text-muted-foreground">{award.awarder}</p>
                          </div>
                          {getDateText(award.date, undefined) && (
                            <div className="text-sm text-muted-foreground">{getDateText(award.date, undefined)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Certificates */}
              {resumeData.certificates.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("tabs.certificates")}</h2>
                  <div className="space-y-4">
                    {resumeData.certificates.map((cert, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{cert.name}</h3>
                            <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                            {cert.url && (
                              <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                View Certificate
                              </a>
                            )}
                          </div>
                          {getDateText(cert.date, undefined) && (
                            <div className="text-sm text-muted-foreground">{getDateText(cert.date, undefined)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Publications */}
              {resumeData.publications.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("tabs.publications")}</h2>
                  <div className="space-y-4">
                    {resumeData.publications.map((pub, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{pub.name}</h3>
                            <p className="text-sm text-muted-foreground">{pub.publisher}</p>
                            {pub.url && (
                              <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                View Publication
                              </a>
                            )}
                          </div>
                          {getDateText(pub.releaseDate, undefined) && (
                            <div className="text-sm text-muted-foreground">{getDateText(pub.releaseDate, undefined)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Languages */}
              {resumeData.languages.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("headings.languages")}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resumeData.languages.map((language, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg">{language.language}</h3>
                        {language.fluency && (
                          <p className="text-sm text-muted-foreground">{language.fluency}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Interests */}
              {resumeData.interests.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("headings.interests")}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resumeData.interests.map((interest, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg">{interest.name}</h3>
                        {interest.keywords && interest.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {interest.keywords.map((keyword, kIdx) => (
                              <span key={kIdx} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded">
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* References */}
              {resumeData.references.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">{t("tabs.references")}</h2>
                  <div className="space-y-4">
                    {resumeData.references.map((reference, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <h3 className="font-semibold">{reference.name}</h3>
                        <p className="text-sm text-muted-foreground">{reference.reference}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

      {/* Resume Metadata */}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("labels.created")}</p>
              <p>{new Date(resume.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("resumeViewer.labels.lastUpdated")}</p>
              <p>{new Date(resume.updatedAt).toLocaleString()}</p>
            </div>
            {canEdit && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("labels.views")}</p>
                <p className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {resume.viewCount}
                </p>
              </div>
            )}
          </div>

          {resume.parentId && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">{t("resumeViewer.labels.variationOf")}</p>
              <Badge variant="outline">{t("resumeViewer.labels.masterResume")}</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
