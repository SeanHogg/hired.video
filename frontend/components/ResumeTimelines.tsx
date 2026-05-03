import {
    Calendar,
    Briefcase,
    GraduationCap,
    Heart,
    Award,
    FileText,
    Clock,
    BookOpen,
    Folder,
    Sparkles,
    Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { ResumeData } from "@/types/resume";
import {
  calculateResumeDuration,
  formatResumeDateRange,
  hasDisplayableDateRange,
} from "@/lib/utils/resume-date";

interface ResumeTimelinesProps {
    resumeData: ResumeData;
}

type TimelineItemType =
    | 'work'
    | 'education'
    | 'volunteer'
    | 'certificate'
    | 'award'
    | 'publication'
    | 'project'
    | 'skill'
    | 'language';

interface TimelineItem {
    type: TimelineItemType;
    title: string;
    organization: string;
    startDate: string;
    endDate: string;
    duration?: string;
    icon: React.ReactNode;
}


export default function ResumeTimelines({ resumeData }: ResumeTimelinesProps) {
    // Date helpers come from the shared resume-date utility so MM/YYYY,
    // YYYY-MM, year-only, and "Present" all parse consistently with the
    // rest of the app.
    const calculateDuration = calculateResumeDuration;
    const formatDateRange = formatResumeDateRange;
    const shouldShowDates = hasDisplayableDateRange;


        // Reusable timeline card component for consistent rendering
        interface TimelineCardProps {
            type: TimelineItemType;
            icon: React.ReactNode;
            title: string;
            organization?: string;
            startDate?: string;
            endDate?: string;
            showDuration?: boolean;
            showTypeBadge?: boolean;
            isCurrent?: boolean;
        }

        const TimelineCard: React.FC<TimelineCardProps> = ({
            type,
            icon,
            title,
            organization,
            startDate = '',
            endDate = '',
            showDuration = true,
            showTypeBadge = false,
            isCurrent = false,
        }) => {
            const typeBadgeColor: Record<TimelineCardProps['type'], string> = {
                work: 'bg-muted',
                education: 'bg-muted',
                volunteer: 'bg-muted',
                certificate: 'bg-muted',
                award: 'bg-muted',
                publication: 'bg-muted',
                project: 'bg-muted',
                skill: 'bg-muted',
                language: 'bg-muted',
            };

            const currentBadge = (() => {
                if (!isCurrent) return null;
                if (type === 'work' || type === 'project') {
                    return (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">Current</span>
                    );
                }
                if (type === 'volunteer') {
                    return (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">Active</span>
                    );
                }
                return null;
            })();

            return (
                <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="pt-2">
                        <div className="flex items-center gap-2 mb-2">
                            {showTypeBadge && (
                                <span className={`text-xs px-2 py-1 rounded-full capitalize ${typeBadgeColor[type]}`}>
                                    {type}
                                </span>
                            )}
                            {currentBadge}
                        </div>
                        <h4 className="font-medium text-sm mb-1 line-clamp-2 flex items-center gap-2">
                            {icon}
                            {title}
                        </h4>
                        {organization && (
                            <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{organization}</p>
                        )}
                        {shouldShowDates(startDate, endDate) && (
                            <div className="text-xs text-muted-foreground">
                                <div>{formatDateRange(startDate, endDate)}</div>
                                {showDuration && calculateDuration(startDate, endDate) && (
                                    <div className="font-medium text-primary mt-1">{calculateDuration(startDate, endDate)}</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        };

    // Overview timeline: sections are shown in a fixed order
    // (work → education → certificates → awards → publications → projects → skills → languages).
    // Within each section, items with a start/end range are sorted consistently:
    //   current (no end date or 'Present') first, newest StartDate first; then past, newest EndDate first.
    // Single-date items (certificates/awards/publications) are sorted newest first.
    // Dateless items (skills/languages) preserve their resume order.
    const createComprehensiveTimeline = (): TimelineItem[] => {
        const isCurrent = (d?: string) => {
            const norm = (d || '').trim().toLowerCase();
            return norm === '' || norm === 'present';
        };
        const safeParse = (d?: string) => {
            const dt = new Date(d || '');
            return isNaN(dt.getTime()) ? new Date('1900-01-01') : dt;
        };
        const sortWithCurrent = (arr: TimelineItem[]): TimelineItem[] => {
            const past = arr.filter(i => !isCurrent(i.endDate));
            const current = arr.filter(i => isCurrent(i.endDate));
            current.sort((a, b) => safeParse(b.startDate).getTime() - safeParse(a.startDate).getTime());
            past.sort((a, b) => safeParse(b.endDate).getTime() - safeParse(a.endDate).getTime());
            return [...current, ...past];
        };
        const sortByDateDesc = (arr: TimelineItem[]): TimelineItem[] =>
            [...arr].sort((a, b) => safeParse(b.startDate).getTime() - safeParse(a.startDate).getTime());

        const work: TimelineItem[] = (resumeData.work ?? []).map(w => ({
            type: 'work',
            title: w.position,
            organization: w.name,
            startDate: w.startDate,
            endDate: w.endDate,
            duration: calculateDuration(w.startDate, w.endDate),
            icon: <Briefcase className="h-4 w-4" />,
        }));

        const education: TimelineItem[] = (resumeData.education ?? []).map(e => ({
            type: 'education',
            title: `${e.studyType} in ${e.area}`,
            organization: e.institution,
            startDate: e.startDate,
            endDate: e.endDate,
            duration: calculateDuration(e.startDate, e.endDate),
            icon: <GraduationCap className="h-4 w-4" />,
        }));

        const certificates: TimelineItem[] = (resumeData.certificates ?? []).map(c => ({
            type: 'certificate',
            title: c.name,
            organization: c.issuer,
            startDate: c.date,
            endDate: c.date,
            icon: <FileText className="h-4 w-4" />,
        }));

        const awards: TimelineItem[] = (resumeData.awards ?? []).map(a => ({
            type: 'award',
            title: a.title,
            organization: a.awarder,
            startDate: a.date,
            endDate: a.date,
            icon: <Award className="h-4 w-4" />,
        }));

        const publications: TimelineItem[] = (resumeData.publications ?? []).map(p => ({
            type: 'publication',
            title: p.name,
            organization: p.publisher,
            startDate: p.releaseDate,
            endDate: p.releaseDate,
            icon: <BookOpen className="h-4 w-4" />,
        }));

        const projects: TimelineItem[] = (resumeData.projects ?? []).map(p => ({
            type: 'project',
            title: p.name,
            organization: p.entity,
            startDate: p.startDate,
            endDate: p.endDate,
            duration: calculateDuration(p.startDate, p.endDate),
            icon: <Folder className="h-4 w-4" />,
        }));

        const skills: TimelineItem[] = (resumeData.skills ?? []).map(s => ({
            type: 'skill',
            title: s.name,
            organization: s.level,
            startDate: '',
            endDate: '',
            icon: <Sparkles className="h-4 w-4" />,
        }));

        const languages: TimelineItem[] = (resumeData.languages ?? []).map(l => ({
            type: 'language',
            title: l.language,
            organization: l.fluency,
            startDate: '',
            endDate: '',
            icon: <Globe className="h-4 w-4" />,
        }));

        return [
            ...sortWithCurrent(work),
            ...sortWithCurrent(education),
            ...sortByDateDesc(certificates),
            ...sortByDateDesc(awards),
            ...sortByDateDesc(publications),
            ...sortWithCurrent(projects),
            ...skills,
            ...languages,
        ];
    };

    // Calculate total experience for work
    const calculateTotalWorkExperience = (): string => {
        if (!resumeData.work?.length) return "0 years";

        let totalMonths = 0;
        resumeData.work.forEach(work => {
            if (work.startDate) {
                const start = new Date(work.startDate);
                // Check if start date is valid
                if (isNaN(start.getTime())) return;

                // Use current date if no end date or marked Present (current position)
                const end = !work.endDate || work.endDate.trim() === '' || work.endDate.trim().toLowerCase() === 'present'
                    ? new Date()
                    : new Date(work.endDate);

                // Check if end date is valid (if provided and not current)
                if (work.endDate && work.endDate.trim() !== '' && work.endDate.trim().toLowerCase() !== 'present' && isNaN(end.getTime())) return;

                const diffTime = Math.abs(end.getTime() - start.getTime());
                const months = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
                totalMonths += months;
            }
        });

        const years = Math.floor(totalMonths / 12);
        const remainingMonths = totalMonths % 12;

        if (years > 0 && remainingMonths > 0) {
            return `${years}y ${remainingMonths}m`;
        } else if (years > 0) {
            return `${years}y`;
        } else if (remainingMonths > 0) {
            return `${remainingMonths}m`;
        } else {
            return "< 1m";
        }
    };

    // Calculate total education duration
    const calculateTotalEducationExperience = (): string => {
        if (!resumeData.education?.length) return "0 years";

        let totalMonths = 0;
        resumeData.education.forEach(edu => {
            if (edu.startDate) {
                const start = new Date(edu.startDate);
                if (isNaN(start.getTime())) return;

                const end = !edu.endDate || edu.endDate.trim() === '' || edu.endDate.trim().toLowerCase() === 'present'
                    ? new Date()
                    : new Date(edu.endDate);

                if (edu.endDate && edu.endDate.trim() !== '' && edu.endDate.trim().toLowerCase() !== 'present' && isNaN(end.getTime())) return;

                const diffTime = Math.abs(end.getTime() - start.getTime());
                const months = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
                totalMonths += months;
            }
        });

        const years = Math.floor(totalMonths / 12);
        const remainingMonths = totalMonths % 12;

        if (years > 0 && remainingMonths > 0) {
            return `${years}y ${remainingMonths}m`;
        } else if (years > 0) {
            return `${years}y`;
        } else if (remainingMonths > 0) {
            return `${remainingMonths}m`;
        } else {
            return "< 1m";
        }
    };

    // Calculate total volunteer experience
    const calculateTotalVolunteerExperience = (): string => {
        if (!resumeData.volunteer?.length) return "0 years";

        let totalMonths = 0;
        resumeData.volunteer.forEach(vol => {
            if (vol.startDate) {
                const start = new Date(vol.startDate);
                // Check if start date is valid
                if (isNaN(start.getTime())) return;

                // Use current date if no end date or marked Present (still volunteering)
                const end = !vol.endDate || vol.endDate.trim() === '' || vol.endDate.trim().toLowerCase() === 'present'
                    ? new Date()
                    : new Date(vol.endDate);

                // Check if end date is valid (if provided and not current)
                if (vol.endDate && vol.endDate.trim() !== '' && vol.endDate.trim().toLowerCase() !== 'present' && isNaN(end.getTime())) return;

                const diffTime = Math.abs(end.getTime() - start.getTime());
                const months = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
                totalMonths += months;
            }
        });

        const years = Math.floor(totalMonths / 12);
        const remainingMonths = totalMonths % 12;

        if (years > 0 && remainingMonths > 0) {
            return `${years}y ${remainingMonths}m`;
        } else if (years > 0) {
            return `${years}y`;
        } else if (remainingMonths > 0) {
            return `${remainingMonths}m`;
        } else {
            return "< 1m";
        }
    };

    // Sort work experience chronologically
    const sortedWork = resumeData.work?.slice().sort((a, b) => {
        const aEnd = (a.endDate || '').trim().toLowerCase();
        const bEnd = (b.endDate || '').trim().toLowerCase();
        const aIsCurrent = aEnd === '' || aEnd === 'present';
        const bIsCurrent = bEnd === '' || bEnd === 'present';

        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        if (!aIsCurrent && !bIsCurrent) {
            const aEndDate = new Date(a.endDate);
            const bEndDate = new Date(b.endDate);
            // Check for valid dates
            if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) {
                return 0; // Keep original order if dates are invalid
            }
            return bEndDate.getTime() - aEndDate.getTime();
        }

        const aStartDate = new Date(a.startDate);
        const bStartDate = new Date(b.startDate);
        // Check for valid dates
        if (isNaN(aStartDate.getTime()) || isNaN(bStartDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bStartDate.getTime() - aStartDate.getTime();
    }) || [];

    // Sort volunteer experience chronologically
    const sortedVolunteer = resumeData.volunteer?.slice().sort((a, b) => {
        const aEnd = (a.endDate || '').trim().toLowerCase();
        const bEnd = (b.endDate || '').trim().toLowerCase();
        const aIsCurrent = aEnd === '' || aEnd === 'present';
        const bIsCurrent = bEnd === '' || bEnd === 'present';

        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        if (!aIsCurrent && !bIsCurrent) {
            const aEndDate = new Date(a.endDate);
            const bEndDate = new Date(b.endDate);
            // Check for valid dates
            if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) {
                return 0; // Keep original order if dates are invalid
            }
            return bEndDate.getTime() - aEndDate.getTime();
        }

        const aStartDate = new Date(a.startDate);
        const bStartDate = new Date(b.startDate);
        // Check for valid dates
        if (isNaN(aStartDate.getTime()) || isNaN(bStartDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bStartDate.getTime() - aStartDate.getTime();
    }) || [];

    // Sort education chronologically
    const sortedEducation = resumeData.education?.slice().sort((a, b) => {
        const aEndDate = new Date(a.endDate || a.startDate);
        const bEndDate = new Date(b.endDate || b.startDate);
        // Check for valid dates
        if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bEndDate.getTime() - aEndDate.getTime();
    }) || [];

    // Sort certificates by date
    const sortedCertificates = resumeData.certificates?.slice().sort((a, b) => {
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        // Check for valid dates
        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bDate.getTime() - aDate.getTime();
    }) || [];

    // Sort awards by date
    const sortedAwards = resumeData.awards?.slice().sort((a, b) => {
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        // Check for valid dates
        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bDate.getTime() - aDate.getTime();
    }) || [];

    const comprehensiveTimeline = createComprehensiveTimeline();

    // Check if we have any timeline data to show
    const hasTimelineData =
        resumeData.work?.length > 0 ||
        resumeData.education?.length > 0 ||
        resumeData.volunteer?.length > 0 ||
        resumeData.certificates?.length > 0 ||
        resumeData.awards?.length > 0;

    if (!hasTimelineData) {
        return null;
    }

    // Determine which tabs to show
    const showWorkTab = resumeData.work?.length > 0;
    const showVolunteerTab = resumeData.volunteer?.length > 0;
    const showEducationTab = resumeData.education?.length > 0;
    const showCertificatesTab = resumeData.certificates?.length > 0;
    const showAwardsTab = resumeData.awards?.length > 0;

    return (
        <Card className="mb-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Career Timeline & Key Highlights
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="comprehensive" className="w-full">
                    <div className="w-full overflow-x-auto">
                        <TabsList className="inline-flex w-max gap-1 lg:grid lg:w-full lg:grid-cols-6 lg:gap-0">
                            <TabsTrigger value="comprehensive" className="text-xs">
                                <Calendar className="h-3 w-3 mr-1" />
                                Overview
                            </TabsTrigger>
                            {showWorkTab && (
                                <TabsTrigger value="work" className="text-xs">
                                    <Briefcase className="h-3 w-3 mr-1" />
                                    Work
                                </TabsTrigger>
                            )}
                            {showVolunteerTab && (
                                <TabsTrigger value="volunteer" className="text-xs">
                                    <Heart className="h-3 w-3 mr-1" />
                                    Volunteer
                                </TabsTrigger>
                            )}
                            {showEducationTab && (
                                <TabsTrigger value="education" className="text-xs">
                                    <GraduationCap className="h-3 w-3 mr-1" />
                                    Education
                                </TabsTrigger>
                            )}
                            {showCertificatesTab && (
                                <TabsTrigger value="certificates" className="text-xs">
                                    <FileText className="h-3 w-3 mr-1" />
                                    Certificates
                                </TabsTrigger>
                            )}
                            {showAwardsTab && (
                                <TabsTrigger value="awards" className="text-xs">
                                    <Award className="h-3 w-3 mr-1" />
                                    Awards
                                </TabsTrigger>
                            )}
                        </TabsList>
                    </div>

                    {/* Comprehensive Timeline */}
                    <TabsContent value="comprehensive" className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            {showWorkTab && (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Total Work Experience: {calculateTotalWorkExperience()}
                                </Badge>
                            )}
                            {showEducationTab && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <GraduationCap className="h-3 w-3" />
                                    Total education: {calculateTotalEducationExperience()}
                                </Badge>
                            )}
                            {showCertificatesTab && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    Total certificates: {resumeData.certificates.length}
                                </Badge>
                            )}
                            {showAwardsTab && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Award className="h-3 w-3" />
                                    Total awards: {resumeData.awards.length}
                                </Badge>
                            )}
                            {resumeData.publications?.length > 0 && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <BookOpen className="h-3 w-3" />
                                    Total publications: {resumeData.publications.length}
                                </Badge>
                            )}
                            {resumeData.projects?.length > 0 && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Folder className="h-3 w-3" />
                                    Total projects: {resumeData.projects.length}
                                </Badge>
                            )}
                            {resumeData.skills?.length > 0 && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    Total skills: {resumeData.skills.length}
                                </Badge>
                            )}
                            {resumeData.languages?.length > 0 && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Globe className="h-3 w-3" />
                                    Total languages: {resumeData.languages.length}
                                </Badge>
                            )}
                            {showVolunteerTab && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Heart className="h-3 w-3" />
                                    volunteer: {calculateTotalVolunteerExperience()}
                                </Badge>
                            )}
                        </div>
                        {/* Horizontal Timeline */}
                        <div className="relative">
                            <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent" style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
                                <div className="flex gap-6 min-w-max px-4">
                                    {comprehensiveTimeline.map((item, index) => (
                                        <div key={index} className="relative flex-shrink-0 w-64 sm:w-72">
                                            {/* Timeline connector line */}
                                            {index < comprehensiveTimeline.length - 1 && (
                                                <div className="absolute top-9 left-full w-6 h-0.5 bg-border z-0" />
                                            )}

                                            {/* Timeline item */}
                                            <TimelineCard
                                                type={item.type}
                                                icon={item.icon}
                                                title={item.title}
                                                organization={item.organization}
                                                startDate={item.startDate}
                                                endDate={item.endDate}
                                                showDuration={true}
                                                showTypeBadge={true}
                                                isCurrent={(item.type === 'work' || item.type === 'volunteer' || item.type === 'project') && (!item.endDate || item.endDate.trim() === '' || item.endDate.trim().toLowerCase() === 'present')}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Scroll indicators */}
                            <div className="flex justify-center mt-2">
                                <div className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/50 px-3 py-1 rounded-full">
                                    <span className="hidden sm:inline">←</span>
                                    <span className="sm:hidden">👈</span>
                                    <span className="hidden sm:inline">Scroll to explore timeline</span>
                                    <span className="sm:hidden">Swipe to explore</span>
                                    <span className="hidden sm:inline">→</span>
                                    <span className="sm:hidden">👉</span>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Work Experience Timeline */}
                    {showWorkTab && (
                        <TabsContent value="work" className="space-y-4">
                            <div className="flex items-center gap-2 mb-4">
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Total Experience: {calculateTotalWorkExperience()}
                                </Badge>
                            </div>
                            {/* Horizontal Work Timeline */}
                            <div className="relative">
                                <div className="overflow-x-auto pb-4">
                                    <div className="flex gap-6 min-w-max px-4">
                                        {sortedWork.map((work, index) => (
                                            <div key={index} className="relative flex-shrink-0 w-72">
                                                {/* Timeline connector line */}
                                                {index < sortedWork.length - 1 && (
                                                    <div className="absolute top-9 left-full w-6 h-0.5 bg-border z-0" />
                                                )}

                                                {/* Timeline item */}
                                                <TimelineCard
                                                    type="work"
                                                    icon={<Briefcase className="w-3 h-3" />}
                                                    title={work.position}
                                                    organization={work.name}
                                                    startDate={work.startDate}
                                                    endDate={work.endDate}
                                                    showDuration={true}
                                                    showTypeBadge={false}
                                                    isCurrent={!work.endDate || work.endDate.trim() === '' || work.endDate.trim().toLowerCase() === 'present'}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Scroll indicators */}
                                <div className="flex justify-center mt-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/50 px-3 py-1 rounded-full">
                                        <span className="hidden sm:inline">←</span>
                                        <span className="sm:hidden">👈</span>
                                        <span className="hidden sm:inline">Scroll to explore work history</span>
                                        <span className="sm:hidden">Swipe work history</span>
                                        <span className="hidden sm:inline">→</span>
                                        <span className="sm:hidden">👉</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {/* Volunteer Experience Timeline */}
                    {showVolunteerTab && (
                        <TabsContent value="volunteer" className="space-y-4">
                            <div className="flex items-center gap-2 mb-4">
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Total volunteer: {calculateTotalVolunteerExperience()}
                                </Badge>
                            </div>
                            {/* Horizontal Volunteer Timeline */}
                            <div className="relative">
                                <div className="overflow-x-auto pb-4">
                                    <div className="flex gap-6 min-w-max px-4">
                                        {sortedVolunteer.map((vol, index) => (
                                            <div key={index} className="relative flex-shrink-0 w-72">
                                                {/* Timeline connector line */}
                                                {index < sortedVolunteer.length - 1 && (
                                                    <div className="absolute top-9 left-full w-6 h-0.5 bg-border z-0" />
                                                )}

                                                {/* Timeline item */}
                                                <TimelineCard
                                                    type="volunteer"
                                                    icon={<Heart className="w-3 h-3" />}
                                                    title={vol.position}
                                                    organization={vol.organization}
                                                    startDate={vol.startDate}
                                                    endDate={vol.endDate}
                                                    showDuration={true}
                                                    showTypeBadge={false}
                                                    isCurrent={!vol.endDate || vol.endDate.trim() === '' || vol.endDate.trim().toLowerCase() === 'present'}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Scroll indicators */}
                                <div className="flex justify-center mt-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span>←</span>
                                        <span>Scroll to explore volunteer history</span>
                                        <span>→</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {/* Education Timeline */}
                    {showEducationTab && (
                        <TabsContent value="education" className="space-y-4">
                            {/* Horizontal Education Timeline */}
                            <div className="relative">
                                <div className="overflow-x-auto pb-4">
                                    <div className="flex gap-6 min-w-max px-4">
                                        {sortedEducation.map((edu, index) => (
                                            <div key={index} className="relative flex-shrink-0 w-72">
                                                {/* Timeline connector line */}
                                                {index < sortedEducation.length - 1 && (
                                                    <div className="absolute top-9 left-full w-6 h-0.5 bg-border z-0" />
                                                )}

                                                {/* Timeline item */}
                                                <TimelineCard
                                                    type="education"
                                                    icon={<GraduationCap className="w-3 h-3" />}
                                                    title={`${edu.studyType} in ${edu.area}`}
                                                    organization={edu.institution}
                                                    startDate={edu.startDate}
                                                    endDate={edu.endDate}
                                                    showDuration={true}
                                                    showTypeBadge={false}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Scroll indicators */}
                                <div className="flex justify-center mt-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span>←</span>
                                        <span>Scroll to explore education history</span>
                                        <span>→</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {/* Certificates Timeline */}
                    {showCertificatesTab && (
                        <TabsContent value="certificates" className="space-y-4">
                            {/* Horizontal Certificates Timeline */}
                            <div className="relative">
                                <div className="overflow-x-auto pb-4">
                                    <div className="flex gap-6 min-w-max px-4">
                                        {sortedCertificates.map((cert, index) => (
                                            <div key={index} className="relative flex-shrink-0 w-64">
                                                {/* Timeline connector line */}
                                                {index < sortedCertificates.length - 1 && (
                                                    <div className="absolute top-9 left-full w-6 h-0.5 bg-border z-0" />
                                                )}

                                                {/* Timeline item */}
                                                <TimelineCard
                                                    type="certificate"
                                                    icon={<FileText className="w-3 h-3" />}
                                                    title={cert.name}
                                                    organization={cert.issuer}
                                                    startDate={cert.date}
                                                    endDate={cert.date}
                                                    showDuration={false}
                                                    showTypeBadge={false}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Scroll indicators */}
                                <div className="flex justify-center mt-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span>←</span>
                                        <span>Scroll to explore certifications</span>
                                        <span>→</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {/* Awards Timeline */}
                    {showAwardsTab && (
                        <TabsContent value="awards" className="space-y-4">
                            {/* Horizontal Awards Timeline */}
                            <div className="relative">
                                <div className="overflow-x-auto pb-4">
                                    <div className="flex gap-6 min-w-max px-4">
                                        {sortedAwards.map((award, index) => (
                                            <div key={index} className="relative flex-shrink-0 w-72">
                                                {/* Timeline connector line */}
                                                {index < sortedAwards.length - 1 && (
                                                    <div className="absolute top-9 left-full w-6 h-0.5 bg-border z-0" />
                                                )}

                                                {/* Timeline item */}
                                                <TimelineCard
                                                    type="award"
                                                    icon={<Award className="w-3 h-3" />}
                                                    title={award.title}
                                                    organization={award.awarder}
                                                    startDate={award.date}
                                                    endDate={award.date}
                                                    showDuration={false}
                                                    showTypeBadge={false}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Scroll indicators */}
                                <div className="flex justify-center mt-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span>←</span>
                                        <span>Scroll to explore awards</span>
                                        <span>→</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    )}
                </Tabs>
            </CardContent>
        </Card>
    );
}