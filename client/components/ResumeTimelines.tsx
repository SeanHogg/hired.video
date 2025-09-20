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
        if (!startDate) return "Unknown duration";

        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date();

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
        if (!dateString) return "Present";
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short'
        });
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
                const end = work.EndDate ? new Date(work.EndDate) : new Date();
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
        } else {
            return `${remainingMonths}m`;
        }
    };

    // Calculate total volunteer experience
    const calculateTotalVolunteerExperience = (): string => {
        if (!resumeData.Volunteer?.length) return "0 years";

        let totalMonths = 0;
        resumeData.Volunteer.forEach(vol => {
            if (vol.StartDate) {
                const start = new Date(vol.StartDate);
                const end = vol.EndDate ? new Date(vol.EndDate) : new Date();
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
        } else {
            return `${remainingMonths}m`;
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
            return bEndDate.getTime() - aEndDate.getTime();
        }

        const aStartDate = new Date(a.StartDate);
        const bStartDate = new Date(b.StartDate);
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
            return bEndDate.getTime() - aEndDate.getTime();
        }

        const aStartDate = new Date(a.StartDate);
        const bStartDate = new Date(b.StartDate);
        return bStartDate.getTime() - aStartDate.getTime();
    }) || [];

    // Sort education chronologically
    const sortedEducation = resumeData.Education?.slice().sort((a, b) => {
        const aEndDate = new Date(a.EndDate || a.StartDate);
        const bEndDate = new Date(b.EndDate || b.StartDate);
        return bEndDate.getTime() - aEndDate.getTime();
    }) || [];

    // Sort certificates by date
    const sortedCertificates = resumeData.Certificates?.slice().sort((a, b) => {
        const aDate = new Date(a.Date);
        const bDate = new Date(b.Date);
        return bDate.getTime() - aDate.getTime();
    }) || [];

    // Sort awards by date
    const sortedAwards = resumeData.Awards?.slice().sort((a, b) => {
        const aDate = new Date(a.Date);
        const bDate = new Date(b.Date);
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
                        <div className="space-y-3">
                            {comprehensiveTimeline.map((item, index) => (
                                <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {item.icon}
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-medium truncate">{item.title}</h4>
                                            <p className="text-sm text-muted-foreground truncate">{item.organization}</p>
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right text-sm text-muted-foreground">
                                        <div>{formatDate(item.startDate)} - {formatDate(item.endDate)}</div>
                                        {item.duration && <div className="text-xs font-medium text-primary">{item.duration}</div>}
                                    </div>
                                </div>
                            ))}
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
                            <div className="space-y-3">
                                {sortedWork.map((work, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Briefcase className="h-4 w-4 text-primary" />
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-medium">{work.Position}</h4>
                                                <p className="text-sm text-muted-foreground">{work.Name}</p>
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right text-sm text-muted-foreground">
                                            <div>{formatDate(work.StartDate)} - {formatDate(work.EndDate)}</div>
                                            <div className="text-xs font-medium text-primary">{calculateDuration(work.StartDate, work.EndDate)}</div>
                                        </div>
                                    </div>
                                ))}
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
                            <div className="space-y-3">
                                {sortedVolunteer.map((vol, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Heart className="h-4 w-4 text-red-500" />
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-medium">{vol.Position}</h4>
                                                <p className="text-sm text-muted-foreground">{vol.Organization}</p>
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right text-sm text-muted-foreground">
                                            <div>{formatDate(vol.StartDate)} - {formatDate(vol.EndDate)}</div>
                                            <div className="text-xs font-medium text-primary">{calculateDuration(vol.StartDate, vol.EndDate)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    )}

                    {/* Education Timeline */}
                    {showEducationTab && (
                        <TabsContent value="education" className="space-y-4">
                            <div className="space-y-3">
                                {sortedEducation.map((edu, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <GraduationCap className="h-4 w-4 text-blue-500" />
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-medium">{edu.StudyType} in {edu.Area}</h4>
                                                <p className="text-sm text-muted-foreground">{edu.Institution}</p>
                                                {edu.Score && (
                                                    <p className="text-xs text-muted-foreground">GPA: {edu.Score}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right text-sm text-muted-foreground">
                                            <div>{formatDate(edu.StartDate)} - {formatDate(edu.EndDate)}</div>
                                            <div className="text-xs font-medium text-primary">{calculateDuration(edu.StartDate, edu.EndDate)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    )}

                    {/* Certificates Timeline */}
                    {showCertificatesTab && (
                        <TabsContent value="certificates" className="space-y-4">
                            <div className="space-y-3">
                                {sortedCertificates.map((cert, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <FileText className="h-4 w-4 text-green-500" />
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-medium">{cert.Name}</h4>
                                                <p className="text-sm text-muted-foreground">{cert.Issuer}</p>
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right text-sm text-muted-foreground">
                                            <div>{formatDate(cert.Date)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    )}

                    {/* Awards Timeline */}
                    {showAwardsTab && (
                        <TabsContent value="awards" className="space-y-4">
                            <div className="space-y-3">
                                {sortedAwards.map((award, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Award className="h-4 w-4 text-yellow-500" />
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-medium">{award.Title}</h4>
                                                <p className="text-sm text-muted-foreground">{award.Awarder}</p>
                                                {award.Summary && (
                                                    <p className="text-xs text-muted-foreground mt-1">{award.Summary}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right text-sm text-muted-foreground">
                                            <div>{formatDate(award.Date)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    )}
                </Tabs>
            </CardContent>
        </Card>
    );
}