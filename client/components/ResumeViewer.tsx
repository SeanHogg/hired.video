import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Edit,
  Eye,
  Download,
  Share2,
  Copy,
  Star,
  Users,
  Lock,
  Globe,
  Calendar,
  MapPin,
  Mail,
  Phone,
  ExternalLink,
  Award,
  CheckCircle2
} from 'lucide-react';
import { Resume, ResumePrivacy, UpdateResumeRequest } from '@/types/resume';
import ResumeBuilder from './ResumeBuilder';

interface ResumeViewerProps {
  resume: Resume;
  onUpdate: (request: UpdateResumeRequest) => void;
  onCreateVariation?: (parentId: string) => void;
  canEdit?: boolean;
}

export default function ResumeViewer({ resume, onUpdate, onCreateVariation, canEdit = true }: ResumeViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [privacy, setPrivacy] = useState<ResumePrivacy>(resume.privacy);
  const [showShareAlert, setShowShareAlert] = useState(false);

  const handlePrivacyChange = (newPrivacy: ResumePrivacy) => {
    setPrivacy(newPrivacy);
    onUpdate({ privacy: newPrivacy });
  };

  const handleEditComplete = (request: any) => {
    onUpdate({
      data: request.data,
      name: request.name,
      privacy: request.privacy,
      isMaster: request.isMaster
    });
    setIsEditing(false);
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/resumes/${resume.id}`;
    navigator.clipboard.writeText(shareUrl);
    setShowShareAlert(true);
    setTimeout(() => setShowShareAlert(false), 3000);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Present';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    });
  };

  const getPrivacyIcon = (privacy: ResumePrivacy) => {
    switch (privacy) {
      case 'public': return <Globe className="h-4 w-4" />;
      case 'recruiter_only': return <Users className="h-4 w-4" />;
      case 'private': return <Lock className="h-4 w-4" />;
    }
  };

  const getPrivacyText = (privacy: ResumePrivacy) => {
    switch (privacy) {
      case 'public': return 'Public';
      case 'recruiter_only': return 'Recruiter Only';
      case 'private': return 'Private';
    }
  };

  const getPrivacyColor = (privacy: ResumePrivacy) => {
    switch (privacy) {
      case 'public': return 'bg-green-100 text-green-800';
      case 'recruiter_only': return 'bg-blue-100 text-blue-800';
      case 'private': return 'bg-gray-100 text-gray-800';
    }
  };

  if (isEditing) {
    return (
      <ResumeBuilder
        initialData={resume.data}
        onSave={handleEditComplete}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{resume.name}</h1>
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
        
        <div className="flex items-center gap-2">
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
          
          {canEdit && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          
          {resume.isMaster && onCreateVariation && (
            <Button onClick={() => onCreateVariation(resume.id)}>
              <Copy className="h-4 w-4 mr-2" />
              Create Variation
            </Button>
          )}
        </div>
      </div>

      {/* Share Success Alert */}
      {showShareAlert && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Resume link copied to clipboard!
          </AlertDescription>
        </Alert>
      )}

      {/* Resume Preview */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-primary text-primary-foreground p-8">
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold">{resume.data.Basics.Name}</h1>
              <p className="text-xl opacity-90">{resume.data.Basics.Label}</p>
              
              <div className="flex flex-wrap justify-center gap-4 text-sm opacity-80">
                {resume.data.Basics.Email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {resume.data.Basics.Email}
                  </div>
                )}
                {resume.data.Basics.Phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {resume.data.Basics.Phone}
                  </div>
                )}
                {resume.data.Basics.Url && (
                  <div className="flex items-center gap-1">
                    <ExternalLink className="h-4 w-4" />
                    <a href={resume.data.Basics.Url} target="_blank" rel="noopener noreferrer">
                      Portfolio
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-8 space-y-8">
            {/* Summary */}
            {resume.data.Basics.Summary && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Professional Summary</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {resume.data.Basics.Summary}
                </p>
              </section>
            )}

            {/* Work Experience */}
            {resume.data.Work.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">Work Experience</h2>
                <div className="space-y-6">
                  {resume.data.Work.map((work, index) => (
                    <div key={index} className="border-l-2 border-primary/20 pl-6 relative">
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-2 top-2"></div>
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <h3 className="text-lg font-semibold">{work.Position}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {formatDate(work.StartDate)} - {formatDate(work.EndDate)}
                          </div>
                        </div>
                        <p className="text-primary font-medium">{work.Name}</p>
                        {work.Summary && (
                          <p className="text-muted-foreground">{work.Summary}</p>
                        )}
                        {work.Highlights.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                            {work.Highlights.map((highlight, highlightIndex) => (
                              <li key={highlightIndex}>{highlight}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Education */}
            {resume.data.Education.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">Education</h2>
                <div className="space-y-4">
                  {resume.data.Education.map((edu, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{edu.StudyType} in {edu.Area}</h3>
                          <p className="text-primary">{edu.Institution}</p>
                          {edu.Score && (
                            <p className="text-sm text-muted-foreground">GPA: {edu.Score}</p>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(edu.StartDate)} - {formatDate(edu.EndDate)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Skills */}
            {resume.data.Skills.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">Skills</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {resume.data.Skills.map((skill, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">{skill.Name}</span>
                      <Badge variant="secondary">{skill.Level}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resume Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Resume Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p>{new Date(resume.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
              <p>{new Date(resume.updatedAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Views</p>
              <p className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {resume.views}
              </p>
            </div>
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
