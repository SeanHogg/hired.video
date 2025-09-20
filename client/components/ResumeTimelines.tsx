import {
    Calendar,
    Briefcase,
    GraduationCap,
    Heart,
    Award,
    FileText,
    Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { ResumeData } from "@/types/resume";

interface ResumeTimelinesProps {
    resumeData: ResumeData;
}

interface TimelineItem {
    type: 'work' | 'education' | 'volunteer' | 'certificate' | 'award';
    title: string;
    organization: string;
    startDate: string;
    endDate: string;
    duration?: string;
    icon: React.ReactNode;
}

export default function ResumeTimelines({ resumeData }: ResumeTimelinesProps) {
    // Calculate duration between two dates
    const calculateDuration = (startDate: string, endDate: string): string => {
        if (!startDate) return "";

        const start = new Date(startDate);
        // Check if start date is valid
        if (isNaN(start.getTime())) return "";

        // Use current date if no end date provided (current position)
        const end = (endDate && endDate !== '') ? new Date(endDate) : new Date();

        // Check if end date is valid (if provided)
        if (endDate && endDate !== '' && isNaN(end.getTime())) {
            return "";
        }

        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const years = Math.floor(diffDays / 365);
        const months = Math.floor((diffDays % 365) / 30);

        if (years > 0 && months > 0) {
            return `${years}y ${months}m`;
        } else if (years > 0) {
            return `${years}y`;
        } else if (months > 0) {
            return `${months}m`;
        } else {
            return "< 1m";
        }
    };

    // Format date for display
    const formatDate = (dateString: string): string => {
        if (!dateString || dateString === '') return "Present";
        const date = new Date(dateString);
        // Check if the date is valid
        if (isNaN(date.getTime())) return "Present";
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short'
        });
    };

    // Check if we should show date information
    const shouldShowDates = (startDate: string, endDate: string): boolean => {
        if (!startDate) return false;
        const start = new Date(startDate);
        if (isNaN(start.getTime())) return false;

        // If both start and end are "Present", don't show
        if (formatDate(startDate) === "Present" && formatDate(endDate) === "Present") return false;

        return true;
    };

    // Format date range for display
    const formatDateRange = (startDate: string, endDate: string): string => {
        if (!shouldShowDates(startDate, endDate)) return "";
        return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    };

    // Create comprehensive timeline combining all experiences
    const createComprehensiveTimeline = (): TimelineItem[] => {
        const items: TimelineItem[] = [];

        // Add work experience
        resumeData.Work?.forEach(work => {
            items.push({
                type: 'work',
                title: work.Position,
                organization: work.Name,
                startDate: work.StartDate,
                endDate: work.EndDate,
                duration: calculateDuration(work.StartDate, work.EndDate),
                icon: <Briefcase className="h-4 w-4" />
            });
        });

        // Add education
        resumeData.Education?.forEach(edu => {
            items.push({
                type: 'education',
                title: `${edu.StudyType} in ${edu.Area}`,
                organization: edu.Institution,
                startDate: edu.StartDate,
                endDate: edu.EndDate,
                duration: calculateDuration(edu.StartDate, edu.EndDate),
                icon: <GraduationCap className="h-4 w-4" />
            });
        });

        // Add volunteer experience
        resumeData.Volunteer?.forEach(vol => {
            items.push({
                type: 'volunteer',
                title: vol.Position,
                organization: vol.Organization,
                startDate: vol.StartDate,
                endDate: vol.EndDate,
                duration: calculateDuration(vol.StartDate, vol.EndDate),
                icon: <Heart className="h-4 w-4" />
            });
        });

        // Add certificates
        resumeData.Certificates?.forEach(cert => {
            items.push({
                type: 'certificate',
                title: cert.Name,
                organization: cert.Issuer,
                startDate: cert.Date,
                endDate: cert.Date,
                icon: <FileText className="h-4 w-4" />
            });
        });

        // Add awards
        resumeData.Awards?.forEach(award => {
            items.push({
                type: 'award',
                title: award.Title,
                organization: award.Awarder,
                startDate: award.Date,
                endDate: award.Date,
                icon: <Award className="h-4 w-4" />
            });
        });

        // Sort by start date (most recent first)
        return items.sort((a, b) => {
            const dateA = new Date(a.startDate || '1900-01-01');
            const dateB = new Date(b.startDate || '1900-01-01');
            return dateB.getTime() - dateA.getTime();
        });
    };

    // Calculate total experience for work
    const calculateTotalWorkExperience = (): string => {
        if (!resumeData.Work?.length) return "0 years";

        let totalMonths = 0;
        resumeData.Work.forEach(work => {
            if (work.StartDate) {
                const start = new Date(work.StartDate);
                // Check if start date is valid
                if (isNaN(start.getTime())) return;

                // Use current date if no end date (current position)
                const end = (work.EndDate && work.EndDate !== '') ? new Date(work.EndDate) : new Date();

                // Check if end date is valid (if provided)
                if (work.EndDate && work.EndDate !== '' && isNaN(end.getTime())) return;

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
        if (!resumeData.Volunteer?.length) return "0 years";

        let totalMonths = 0;
        resumeData.Volunteer.forEach(vol => {
            if (vol.StartDate) {
                const start = new Date(vol.StartDate);
                // Check if start date is valid
                if (isNaN(start.getTime())) return;

                // Use current date if no end date (still volunteering)
                const end = (vol.EndDate && vol.EndDate !== '') ? new Date(vol.EndDate) : new Date();

                // Check if end date is valid (if provided)
                if (vol.EndDate && vol.EndDate !== '' && isNaN(end.getTime())) return;

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
    const sortedWork = resumeData.Work?.slice().sort((a, b) => {
        const aIsCurrent = !a.EndDate || a.EndDate === '';
        const bIsCurrent = !b.EndDate || b.EndDate === '';

        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        if (!aIsCurrent && !bIsCurrent) {
            const aEndDate = new Date(a.EndDate);
            const bEndDate = new Date(b.EndDate);
            // Check for valid dates
            if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) {
                return 0; // Keep original order if dates are invalid
            }
            return bEndDate.getTime() - aEndDate.getTime();
        }

        const aStartDate = new Date(a.StartDate);
        const bStartDate = new Date(b.StartDate);
        // Check for valid dates
        if (isNaN(aStartDate.getTime()) || isNaN(bStartDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bStartDate.getTime() - aStartDate.getTime();
    }) || [];

    // Sort volunteer experience chronologically
    const sortedVolunteer = resumeData.Volunteer?.slice().sort((a, b) => {
        const aIsCurrent = !a.EndDate || a.EndDate === '';
        const bIsCurrent = !b.EndDate || b.EndDate === '';

        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        if (!aIsCurrent && !bIsCurrent) {
            const aEndDate = new Date(a.EndDate);
            const bEndDate = new Date(b.EndDate);
            // Check for valid dates
            if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) {
                return 0; // Keep original order if dates are invalid
            }
            return bEndDate.getTime() - aEndDate.getTime();
        }

        const aStartDate = new Date(a.StartDate);
        const bStartDate = new Date(b.StartDate);
        // Check for valid dates
        if (isNaN(aStartDate.getTime()) || isNaN(bStartDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bStartDate.getTime() - aStartDate.getTime();
    }) || [];

    // Sort education chronologically
    const sortedEducation = resumeData.Education?.slice().sort((a, b) => {
        const aEndDate = new Date(a.EndDate || a.StartDate);
        const bEndDate = new Date(b.EndDate || b.StartDate);
        // Check for valid dates
        if (isNaN(aEndDate.getTime()) || isNaN(bEndDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bEndDate.getTime() - aEndDate.getTime();
    }) || [];

    // Sort certificates by date
    const sortedCertificates = resumeData.Certificates?.slice().sort((a, b) => {
        const aDate = new Date(a.Date);
        const bDate = new Date(b.Date);
        // Check for valid dates
        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bDate.getTime() - aDate.getTime();
    }) || [];

    // Sort awards by date
    const sortedAwards = resumeData.Awards?.slice().sort((a, b) => {
        const aDate = new Date(a.Date);
        const bDate = new Date(b.Date);
        // Check for valid dates
        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) {
            return 0; // Keep original order if dates are invalid
        }
        return bDate.getTime() - aDate.getTime();
    }) || [];

    const comprehensiveTimeline = createComprehensiveTimeline();

    // Check if we have any timeline data to show
    const hasTimelineData =
        resumeData.Work?.length > 0 ||
        resumeData.Education?.length > 0 ||
        resumeData.Volunteer?.length > 0 ||
        resumeData.Certificates?.length > 0 ||
        resumeData.Awards?.length > 0;

    if (!hasTimelineData) {
        return null;
    }

    // Determine which tabs to show
    const showWorkTab = resumeData.Work?.length > 0;
    const showVolunteerTab = resumeData.Volunteer?.length > 0;
    const showEducationTab = resumeData.Education?.length > 0;
    const showCertificatesTab = resumeData.Certificates?.length > 0;
    const showAwardsTab = resumeData.Awards?.length > 0;

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
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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

                    {/* Comprehensive Timeline */}
                    <TabsContent value="comprehensive" className="space-y-4">
                        <div className="flex items-center gap-4 mb-4">
                            <Badge variant="secondary" className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Total Work Experience: {calculateTotalWorkExperience()}
                            </Badge>
                            {showVolunteerTab && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Heart className="h-3 w-3" />
                                    Volunteer: {calculateTotalVolunteerExperience()}
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
                                            <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                {/* Timeline dot */}
                                                <div className="absolute -top-2 left-4 w-6 h-6 bg-primary rounded-full border-2 border-background shadow-sm flex items-center justify-center">
                                                    <div className="text-background text-xs">
                                                        {item.icon}
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="pt-2">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {item.icon}
                                                        <span className="text-xs px-2 py-1 bg-muted rounded-full capitalize">
                                                            {item.type}
                                                        </span>
                                                    </div>
                                                    <h4 className="font-medium text-sm mb-1 line-clamp-2">{item.title}</h4>
                                                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{item.organization}</p>
                                                    {shouldShowDates(item.startDate, item.endDate) && (
                                                        <div className="text-xs text-muted-foreground">
                                                            <div>{formatDateRange(item.startDate, item.endDate)}</div>
                                                            {item.duration && <div className="font-medium text-primary mt-1">{item.duration}</div>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
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
                                                <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    {/* Timeline dot */}
                                                    <div className="absolute -top-2 left-4 w-6 h-6 bg-primary rounded-full border-2 border-background shadow-sm flex items-center justify-center">
                                                        <Briefcase className="w-3 h-3 text-background" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="pt-2">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {(!work.EndDate || work.EndDate === '') && (
                                                                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                                                                    Current
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h4 className="font-medium text-sm mb-1 line-clamp-2">{work.Position}</h4>
                                                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{work.Name}</p>
                                                        {shouldShowDates(work.StartDate, work.EndDate) && (
                                                            <div className="text-xs text-muted-foreground">
                                                                <div>{formatDateRange(work.StartDate, work.EndDate)}</div>
                                                                {calculateDuration(work.StartDate, work.EndDate) && (
                                                                    <div className="font-medium text-primary mt-1">{calculateDuration(work.StartDate, work.EndDate)}</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
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
                                    Total Volunteer: {calculateTotalVolunteerExperience()}
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
                                                <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    {/* Timeline dot */}
                                                    <div className="absolute -top-2 left-4 w-6 h-6 bg-red-500 rounded-full border-2 border-background shadow-sm flex items-center justify-center">
                                                        <Heart className="w-3 h-3 text-background" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="pt-2">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {(!vol.EndDate || vol.EndDate === '') && (
                                                                <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
                                                                    Active
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h4 className="font-medium text-sm mb-1 line-clamp-2">{vol.Position}</h4>
                                                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{vol.Organization}</p>
                                                        {shouldShowDates(vol.StartDate, vol.EndDate) && (
                                                            <div className="text-xs text-muted-foreground">
                                                                <div>{formatDateRange(vol.StartDate, vol.EndDate)}</div>
                                                                {calculateDuration(vol.StartDate, vol.EndDate) && (
                                                                    <div className="font-medium text-primary mt-1">{calculateDuration(vol.StartDate, vol.EndDate)}</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
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
                                                <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    {/* Timeline dot */}
                                                    <div className="absolute -top-2 left-4 w-6 h-6 bg-blue-500 rounded-full border-2 border-background shadow-sm flex items-center justify-center">
                                                        <GraduationCap className="w-3 h-3 text-background" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="pt-2">
                                                        <h4 className="font-medium text-sm mb-1 line-clamp-2">{edu.StudyType} in {edu.Area}</h4>
                                                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{edu.Institution}</p>
                                                        {edu.Score && (
                                                            <p className="text-xs text-muted-foreground mb-2">GPA: {edu.Score}</p>
                                                        )}
                                                        {shouldShowDates(edu.StartDate, edu.EndDate) && (
                                                            <div className="text-xs text-muted-foreground">
                                                                <div>{formatDateRange(edu.StartDate, edu.EndDate)}</div>
                                                                {calculateDuration(edu.StartDate, edu.EndDate) && (
                                                                    <div className="font-medium text-primary mt-1">{calculateDuration(edu.StartDate, edu.EndDate)}</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
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
                                                <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    {/* Timeline dot */}
                                                    <div className="absolute -top-2 left-4 w-6 h-6 bg-green-500 rounded-full border-2 border-background shadow-sm flex items-center justify-center">
                                                        <FileText className="w-3 h-3 text-background" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="pt-2">
                                                        <h4 className="font-medium text-sm mb-1 line-clamp-2">{cert.Name}</h4>
                                                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{cert.Issuer}</p>
                                                        {cert.Date && formatDate(cert.Date) !== "Present" && (
                                                            <div className="text-xs text-muted-foreground">
                                                                <div>{formatDate(cert.Date)}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
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
                                                <div className="relative bg-background border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    {/* Timeline dot */}
                                                    <div className="absolute -top-2 left-4 w-6 h-6 bg-yellow-500 rounded-full border-2 border-background shadow-sm flex items-center justify-center">
                                                        <Award className="w-3 h-3 text-background" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="pt-2">
                                                        <h4 className="font-medium text-sm mb-1 line-clamp-2">{award.Title}</h4>
                                                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{award.Awarder}</p>
                                                        {award.Summary && (
                                                            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{award.Summary}</p>
                                                        )}
                                                        {award.Date && formatDate(award.Date) !== "Present" && (
                                                            <div className="text-xs text-muted-foreground">
                                                                <div>{formatDate(award.Date)}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
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