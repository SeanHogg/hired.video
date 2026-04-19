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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetaBadge } from "./MetaBadge";
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
  const [privacy, setPrivacy] = useState<ResumePrivacy>(resume?.privacy || "private");
  const [showShareAlert, setShowShareAlert] = useState(false);

  // Featured Video from metadata (match ResumeDetail behavior) - moved before early returns
  const videoMetaItems = useMemo<ResumeSectionMeta[]>(() => {
    const all = resume?.metaData || [];
    const videoTypes = new Set([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
    return all.filter((m) => videoTypes.has(m.metaType));
  }, [resume?.metaData]);
  const [videoIndex, setVideoIndex] = useState<number>(0);
  useEffect(() => {
    if (videoIndex >= videoMetaItems.length) setVideoIndex(0);
  }, [videoMetaItems.length, videoIndex]);

  // Handle selectedMediaId to automatically select the appropriate video and scroll to section - moved before early returns
  useEffect(() => {
    if (selectedMediaId && resume?.metaData) {
      // Find the media item
      const mediaItem = resume.metaData.find(m => m.id === selectedMediaId || m.referenceId === selectedMediaId);
      if (mediaItem) {
        // If it's a video type, set the video index
        const videoTypes = new Set([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
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
  }, [selectedMediaId, resume?.metaData, videoMetaItems]);

  // Safety check for resume data
  if (!resume) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Resume data not available</h2>
        <p className="text-muted-foreground">Unable to load resume information.</p>
      </div>
    );
  }

  // Additional safety checks
  if (!resume.data) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Resume content not available</h2>
        <p className="text-muted-foreground">Resume data structure is incomplete.</p>
      </div>
    );
  }

  // Ensure resume.data exists and has required structure
  const resumeData = resume.data || {
    Basics: {
      Name: "",
      Label: "",
      Image: "",
      Email: "",
      Phone: "",
      Url: "",
      Summary: "",
      Location: null
    },
    Work: [],
    Education: [],
    Skills: [],
    Volunteer: [],
    Awards: [],
    Certificates: [],
    Publications: [],
    Languages: [],
    Interests: [],
    References: [],
    Projects: [],
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
    if (/^present$/i.test(raw) || /^current$/i.test(raw) || /^now$/i.test(raw)) return "Present";

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
    if (!end && treatMissingEndAsPresent) end = "Present";

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
        return "Public";
      case "recruiter_only":
        return "Recruiter Only";
      case "connections":
        return "Connections";
      case "private":
        return "Private";
      default:
        return "Private";
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
            <h1 className="text-xl sm:text-2xl font-bold">{resume.name}</h1>
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
              <h1 className="text-4xl font-bold">{resumeData.Basics.Name}</h1>
              <p className="text-xl opacity-90">{resumeData.Basics.Label}</p>

              <div className="flex flex-wrap justify-center gap-4 text-sm opacity-80">
                {resumeData.Basics.Email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {resumeData.Basics.Email}
                  </div>
                )}
                {resumeData.Basics.Phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {resumeData.Basics.Phone}
                  </div>
                )}
                {resumeData.Basics.Url && (
                  <div className="flex items-center gap-1">
                    <ExternalLink className="h-4 w-4" />
                    <a
                      href={resumeData.Basics.Url}
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
                        aria-label="Previous video"
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
                        aria-label="Next video"
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
                        title={currentVideoMeta.name || "Video Resume"}
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
            {resumeData.Basics.Summary && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Professional Summary</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {resumeData.Basics.Summary}
                </p>
              </section>
            )}

            {/* Basics Metadata */}
            {resume.metaData && resumeData.Basics.Id && (
              <section data-section-id={resumeData.Basics.Id}>
                <div className="flex flex-wrap gap-2">
                  {resume.metaData
                    .filter((m) => m.referenceId === resumeData.Basics.Id)
                    .map((m) => (
                      <MetaBadge key={m.id} meta={m} />
                    ))}
                </div>
              </section>
            )}

            {/* Work Experience */}
            {resumeData.Work.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">Work Experience</h2>
                <div className="space-y-6">
                  {resumeData.Work
                    .slice()
                    .sort((a, b) => {
                      const norm = (s?: string) => (s || '').trim().toLowerCase();
                      // Current positions (no end date or 'present') come first
                      const aEnd = norm(a.EndDate);
                      const bEnd = norm(b.EndDate);
                      const aIsCurrent = aEnd === '' || aEnd === 'present';
                      const bIsCurrent = bEnd === '' || bEnd === 'present';

                      if (aIsCurrent && !bIsCurrent) return -1;
                      if (!aIsCurrent && bIsCurrent) return 1;

                      // For positions with end dates, sort by end date descending (most recent first)
                      if (!aIsCurrent && !bIsCurrent) {
                        const aEndDate = new Date(a.EndDate || a.StartDate);
                        const bEndDate = new Date(b.EndDate || b.StartDate);
                        if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) return 0;
                        return bEndDate.getTime() - aEndDate.getTime();
                      }

                      // For current positions, sort by start date descending (most recent first)
                      const aStartDate = new Date(a.StartDate);
                      const bStartDate = new Date(b.StartDate);
                      if (isNaN(aStartDate.getTime()) || isNaN(bStartDate.getTime())) return 0;
                      return bStartDate.getTime() - aStartDate.getTime();
                    })
                    .map((work, index) => (
                    <div
                      key={index}
                      className="border-l-2 border-primary/20 pl-6 relative"
                      data-section-id={work.Id}
                    >
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-2 top-2" />
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <h3 className="text-lg font-semibold">
                            {work.Position}
                          </h3>
                          {getDateText(work.StartDate, work.EndDate, true) && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>{getDateText(work.StartDate, work.EndDate, true)}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-primary font-medium">{work.Name}</p>

	                    {/* Metadata for Work item */}
	                    {resume.metaData && work.Id && (
	                      <div className="mt-2 flex flex-wrap gap-2">
	                        {resume.metaData
	                          .filter(m => m.referenceId === work.Id)
	                          .map((m) => (
	                            <MetaBadge key={m.id} meta={m} />
	                          ))}
	                      </div>
	                    )}

                        {work.Summary && (
                          <p className="text-muted-foreground">
                            {work.Summary}
                          </p>
                        )}
                        {work.Highlights.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                            {work.Highlights.map(
                              (highlight, highlightIndex) => (
                                <li key={highlightIndex}>{highlight}</li>
                              ),
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Education */}
            {resumeData.Education.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">Education</h2>
                <div className="space-y-4">
                  {resumeData.Education.map((edu, index) => (


                    <div key={index} className="border rounded-lg p-4" data-section-id={edu.Id}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">
                            {edu.StudyType} in {edu.Area}
                          </h3>
                          <p className="text-primary">{edu.Institution}</p>
                          {edu.Score && (
                            <p className="text-sm text-muted-foreground">
                              GPA: {edu.Score}
                            </p>
                          )}
                        </div>
                        {getDateText(edu.StartDate, edu.EndDate) && (
                          <div className="text-sm text-muted-foreground">
                            {getDateText(edu.StartDate, edu.EndDate)}
                          </div>
                        )}
                        {/* Metadata for Education item */}
                        {resume.metaData && edu.Id && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {resume.metaData
                              .filter((m) => m.referenceId === edu.Id)
                              .map((m) => (
                                <MetaBadge key={m.id} meta={m} />
                              ))}
                          </div>
                        )}

                      </div>
                    </div>


                  ))}
                </div>
              </section>
            )}

              {/* Volunteer Experience */}
              {resumeData.Volunteer.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Volunteer Experience</h2>
                  <div className="space-y-4">
                    {resumeData.Volunteer
                      .slice()
                      .sort((a, b) => new Date(b.StartDate).getTime() - new Date(a.StartDate).getTime())
                      .map((volunteer, index) => (
                        <div key={index} className="border rounded-lg p-4" data-section-id={volunteer.Id}>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <h3 className="font-semibold">{volunteer.Position}</h3>
                              <p className="text-primary">{volunteer.Organization}</p>
                              {volunteer.Summary && (
                                <p className="text-sm text-muted-foreground">{volunteer.Summary}</p>
                              )}
                            </div>
                            {getDateText(volunteer.StartDate, volunteer.EndDate, true) && (
                              <div className="text-sm text-muted-foreground">
                                {getDateText(volunteer.StartDate, volunteer.EndDate, true)}
                              </div>
                            )}
                          </div>

                          {/* Metadata for Volunteer item */}
                          {resume.metaData && volunteer.Id && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {resume.metaData
                                .filter((m) => m.referenceId === volunteer.Id)
                                .map((m) => (
                                  <MetaBadge key={m.id} meta={m} />
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </section>
              )}


            {/* Skills */}
            {resumeData.Skills.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">Skills</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {resumeData.Skills.map((skill, index) => (
                    <div key={index} className="flex flex-col gap-2 p-3 border rounded-lg" data-section-id={skill.Id}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{skill.Name}</span>
                        <Badge variant="secondary">{skill.Level}</Badge>
                      </div>
                      {skill.Keywords && skill.Keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.Keywords.map((keyword, keywordIndex) => (
                            <span
                              key={keywordIndex}
                              className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                      {resume.metaData && skill.Id && (
                        <div className="flex flex-wrap gap-2">
                          {resume.metaData
                            .filter((m) => m.referenceId === skill.Id)
                            .map((m) => (
                              <MetaBadge key={m.id} meta={m} />
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </CardContent>
      </Card>


              {/* Projects */}
              {resumeData.Projects.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Projects</h2>
                  <div className="space-y-6">
                    {resumeData.Projects.map((project, index) => (
                      <div key={index} className="border-b pb-6 last:border-b-0 last:pb-0" data-section-id={project.Id}>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg">{project.Name}</h3>
                          {project.Url && (
                            <a href={project.Url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        {(project.StartDate || project.EndDate) && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {getDateText(project.StartDate, project.EndDate, true)}
                          </p>
                        )}
                        {project.Entity && (
                          <p className="text-sm text-muted-foreground mb-2">{project.Entity}</p>
                        )}
                        {project.Description && <p className="text-sm mb-3">{project.Description}</p>}
                        {project.Highlights && project.Highlights.length > 0 && (
                          <ul className="list-disc list-inside text-sm mb-3 space-y-1">
                            {project.Highlights.map((highlight, hIndex) => (
                              <li key={hIndex}>{highlight}</li>
                            ))}
                          </ul>
                        )}
                        {resume.metaData && project.Id && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {resume.metaData
                              .filter((m) => m.referenceId === project.Id)
                              .map((m) => (
                                <MetaBadge key={m.id} meta={m} />
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Awards */}
              {resumeData.Awards.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Awards</h2>
                  <div className="space-y-4">
                    {resumeData.Awards.map((award, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{award.Title}</h3>
                            <p className="text-sm text-muted-foreground">{award.Awarder}</p>
                          </div>
                          {getDateText(award.Date, undefined) && (
                            <div className="text-sm text-muted-foreground">{getDateText(award.Date, undefined)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Certificates */}
              {resumeData.Certificates.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Certificates</h2>
                  <div className="space-y-4">
                    {resumeData.Certificates.map((cert, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{cert.Name}</h3>
                            <p className="text-sm text-muted-foreground">{cert.Issuer}</p>
                            {cert.Url && (
                              <a href={cert.Url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                View Certificate
                              </a>
                            )}
                          </div>
                          {getDateText(cert.Date, undefined) && (
                            <div className="text-sm text-muted-foreground">{getDateText(cert.Date, undefined)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Publications */}
              {resumeData.Publications.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Publications</h2>
                  <div className="space-y-4">
                    {resumeData.Publications.map((pub, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{pub.Name}</h3>
                            <p className="text-sm text-muted-foreground">{pub.Publisher}</p>
                            {pub.Url && (
                              <a href={pub.Url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                View Publication
                              </a>
                            )}
                          </div>
                          {getDateText(pub.ReleaseDate, undefined) && (
                            <div className="text-sm text-muted-foreground">{getDateText(pub.ReleaseDate, undefined)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Languages */}
              {resumeData.Languages.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Languages</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resumeData.Languages.map((language, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg">{language.Language}</h3>
                        {language.Fluency && (
                          <p className="text-sm text-muted-foreground">{language.Fluency}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Interests */}
              {resumeData.Interests.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Interests</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resumeData.Interests.map((interest, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg">{interest.Name}</h3>
                        {interest.Keywords && interest.Keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {interest.Keywords.map((keyword, kIdx) => (
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
              {resumeData.References.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">References</h2>
                  <div className="space-y-4">
                    {resumeData.References.map((reference, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <h3 className="font-semibold">{reference.Name}</h3>
                        <p className="text-sm text-muted-foreground">{reference.Reference}</p>
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
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p>{new Date(resume.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
              <p>{new Date(resume.updatedAt).toLocaleString()}</p>
            </div>
            {canEdit && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Views</p>
                <p className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {resume.views}
                </p>
              </div>
            )}
          </div>

          {resume.parentId && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Variation of</p>
              <Badge variant="outline">Master Resume</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
