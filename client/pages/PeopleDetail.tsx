import {
  MapPin,
  Globe,
  Mail,
  Phone,
  Edit,
  Share,
  Bookmark,
  BookmarkCheck,
  Users,
  Eye,
  Calendar,
  Building2,
  MessageCircle,
  UserPlus,
  ExternalLink,
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Award,
  CheckCircle,
  Clock,
  Star,
  Linkedin,
  Github,
  X,
  Send
} from 'lucide-react';
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthOverlay from '@/components/AuthOverlay';
import Footer from '@/components/Footer';
import Navigation from '@/components/Navigation';
import Sidebar from '@/components/Sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  getUserById, 
  addTrackedPerson, 
  removeTrackedPerson, 
  isPersonTrackedByUser,
  getConnectionStatus,
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  getPendingConnectionRequests
} from '@/data/mockPeople';
import { getResumesByUserId } from '@/data/mockResumes';
import { useSidebar } from '@/hooks/use-sidebar';
import { useAuth } from '@/lib/auth';
import { generateFakePersonData } from '@/lib/fakeData';

export default function PeopleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    about: true,
    experience: true,
    education: false,
    skills: true,
    projects: false
  });
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  const rawPerson = id ? getUserById(id) : null;
  const person = rawPerson ? (isAuthenticated ? rawPerson : generateFakePersonData(rawPerson)) : null;
  const isTracked = user && rawPerson ? isPersonTrackedByUser(rawPerson.id, user.id) : false;
  const connectionStatus = user && rawPerson ? getConnectionStatus(user.id, rawPerson.id) : 'none';
  const isOwnProfile = user && rawPerson && rawPerson.id === user.id;

  // Check if person has an active public resume
  const personResumes = rawPerson ? getResumesByUserId(rawPerson.id) : [];
  const hasActivePublicResume = personResumes.some(resume => resume.privacy === 'public' && resume.isActive);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleTrackPerson = () => {
    if (!isAuthenticated) {
      return;
    }

    if (user && rawPerson) {
      if (isTracked) {
        removeTrackedPerson(rawPerson.id, user.id);
      } else {
        addTrackedPerson(rawPerson.id, user.id);
      }
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleSendConnectionRequest = () => {
    if (!isAuthenticated) {
      return;
    }

    if (user && rawPerson) {
      sendConnectionRequest(user.id, rawPerson.id, connectionMessage);
      setShowConnectionDialog(false);
      setConnectionMessage('');
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleAcceptConnection = () => {
    if (!isAuthenticated) {
      return;
    }

    if (user && rawPerson) {
      const requests = getPendingConnectionRequests(user.id);
      const request = requests.find(req => req.fromUserId === rawPerson.id);
      if (request) {
        acceptConnectionRequest(request.id);
        // In a real app, you'd trigger a re-render here
      }
    }
  };

  const handleRejectConnection = () => {
    if (user && person) {
      const requests = getPendingConnectionRequests(user.id);
      const request = requests.find(req => req.fromUserId === person.id);
      if (request) {
        rejectConnectionRequest(request.id);
        // In a real app, you'd trigger a re-render here
      }
    }
  };

  const handleMessage = () => {
    // Navigate to messaging or open message modal
    console.log('Message person:', person?.id);
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={closeSidebar} 
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation 
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
              <p className="text-muted-foreground mb-6">The profile you're looking for doesn't exist or has been removed.</p>
              <Button asChild>
                <Link to="/people">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to People
                </Link>
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'looking':
        return 'bg-blue-100 text-blue-800';
      case 'busy':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'job_seeker':
        return 'Job Seeker';
      case 'recruiter':
        return 'Recruiter';
      case 'business':
        return 'Business Leader';
      default:
        return role;
    }
  };

  const currentPosition = person.data.experience.find(exp => exp.isCurrent);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={closeSidebar} 
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation 
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <div className={`pt-16 ${!isAuthenticated ? 'relative' : ''}`}>
          {!isAuthenticated && (
            <AuthOverlay
              contentType="person"
              title={`${person?.data.firstName} ${person?.data.lastName}`}
            />
          )}
          <div className="max-w-6xl mx-auto p-6">
            {/* Back Button */}
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate('/people')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to People
              </Button>
            </div>

            {/* Profile Header */}
            <div className="mb-8">
              <Card>
                <CardHeader className="pb-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Profile Avatar */}
                    <div className="flex-shrink-0">
                      <Avatar className="w-32 h-32">
                        <AvatarImage src={person.data.avatar} alt={`${person.data.firstName} ${person.data.lastName}`} />
                        <AvatarFallback className="text-4xl">
                          {person.data.firstName.charAt(0)}{person.data.lastName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Profile Info */}
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-3xl">
                              {person.data.firstName} {person.data.lastName}
                            </CardTitle>
                            {person.isVerified && (
                              <CheckCircle className="h-6 w-6 text-blue-600" />
                            )}
                            {person.isPremium && (
                              <Star className="h-6 w-6 text-yellow-500" />
                            )}
                          </div>
                          <CardDescription className="text-xl mb-3">
                            {person.data.headline}
                          </CardDescription>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              <span>{getRoleLabel(person.role)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>
                                {person.data.location.remote 
                                  ? 'Remote' 
                                  : `${person.data.location.city}, ${person.data.location.state}`}
                              </span>
                            </div>
                          </div>
                          {currentPosition && (
                            <div className="flex items-center gap-2 text-sm">
                              <Briefcase className="h-4 w-4 text-muted-foreground" />
                              <span>{currentPosition.title} at {currentPosition.company}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(person.status)}>
                            {person.status}
                          </Badge>
                          {person.data.openToWork && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              Open to Work
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isOwnProfile && user && (
                        <div className="flex items-center gap-3 mb-4">
                          {connectionStatus === 'pending_received' ? (
                            <div className="flex gap-2">
                              <Button onClick={handleAcceptConnection}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Accept Connection
                              </Button>
                              <Button variant="outline" onClick={handleRejectConnection}>
                                <X className="h-4 w-4 mr-2" />
                                Decline
                              </Button>
                            </div>
                          ) : connectionStatus === 'pending_sent' ? (
                            <Button variant="outline" disabled>
                              <Clock className="h-4 w-4 mr-2" />
                              Connection Pending
                            </Button>
                          ) : connectionStatus === 'connected' ? (
                            <Button onClick={handleMessage}>
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Message
                            </Button>
                          ) : (
                            <Dialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog}>
                              <DialogTrigger asChild>
                                <Button>
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Connect
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Send Connection Request</DialogTitle>
                                  <DialogDescription>
                                    Add a personal message to your connection request to {person.data.firstName}.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <Textarea
                                    placeholder="I'd love to connect and expand my professional network..."
                                    value={connectionMessage}
                                    onChange={(e) => setConnectionMessage(e.target.value)}
                                    rows={3}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setShowConnectionDialog(false)}>
                                      Cancel
                                    </Button>
                                    <Button onClick={handleSendConnectionRequest}>
                                      <Send className="h-4 w-4 mr-2" />
                                      Send Request
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}

                          <Button variant="outline" onClick={handleTrackPerson}>
                            {isTracked ? (
                              <>
                                <BookmarkCheck className="h-4 w-4 mr-2" />
                                Following
                              </>
                            ) : (
                              <>
                                <Bookmark className="h-4 w-4 mr-2" />
                                Follow
                              </>
                            )}
                          </Button>

                          <Button variant="outline" size="icon">
                            <Share className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      {/* Own Profile Edit Button */}
                      {isOwnProfile && (
                        <div className="mb-4">
                          <Button asChild>
                            <Link to="/profile">
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Profile
                            </Link>
                          </Button>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-primary">{person.connectionCount}</div>
                          <div className="text-sm text-muted-foreground">Connections</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-primary">{person.followerCount}</div>
                          <div className="text-sm text-muted-foreground">Followers</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-primary">{person.profileViews}</div>
                          <div className="text-sm text-muted-foreground">Profile Views</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* About Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line leading-relaxed">{person.data.summary}</p>
                  </CardContent>
                </Card>

                {/* Resume Details - Only show if user has active public resume */}
                {hasActivePublicResume ? (
                  <>
                    {/* Experience Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          Experience
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          {person.data.experience.map((exp, index) => (
                            <div key={index} className="flex gap-4">
                              <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                                  <Building2 className="h-6 w-6 text-primary" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <h3 className="font-semibold text-lg">{exp.title}</h3>
                                    <p className="text-muted-foreground">{exp.company}</p>
                                    {exp.location && (
                                      <p className="text-sm text-muted-foreground">{exp.location}</p>
                                    )}
                                  </div>
                                  {exp.isCurrent && (
                                    <Badge variant="outline" className="bg-green-50 text-green-700">
                                      Current
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {exp.startDate} - {exp.endDate || 'Present'}
                                </p>
                                {exp.description && (
                                  <p className="text-sm mb-3">{exp.description}</p>
                                )}
                                {exp.skills && exp.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {exp.skills.map((skill, skillIndex) => (
                                      <Badge key={skillIndex} variant="secondary" className="text-xs">
                                        {skill}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Education Section */}
                    {person.data.education.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <GraduationCap className="h-5 w-5" />
                            Education
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {person.data.education.map((edu, index) => (
                              <div key={index} className="flex gap-4">
                                <div className="flex-shrink-0">
                                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                                    <GraduationCap className="h-6 w-6 text-blue-600" />
                                  </div>
                                </div>
                                <div>
                                  <h3 className="font-semibold">{edu.degree} in {edu.field}</h3>
                                  <p className="text-muted-foreground">{edu.institution}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {edu.startDate} - {edu.endDate || 'Present'}
                                  </p>
                                  {edu.gpa && (
                                    <p className="text-sm text-muted-foreground">GPA: {edu.gpa}</p>
                                  )}
                                  {edu.description && (
                                    <p className="text-sm mt-2">{edu.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Skills Section */}
                    {person.data.skills.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Award className="h-5 w-5" />
                            Skills & Expertise
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {person.data.skills.map((skill, index) => (
                              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <div className="font-medium">{skill.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {skill.level}
                                    {skill.yearsOfExperience && ` • ${skill.yearsOfExperience} years`}
                                  </div>
                                </div>
                                {skill.endorsements && (
                                  <Badge variant="outline" className="text-xs">
                                    {skill.endorsements} endorsements
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Projects Section */}
                    {person.data.projects.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Projects</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {person.data.projects.map((project, index) => (
                              <div key={index} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-semibold">{project.name}</h3>
                                  {project.url && (
                                    <Button variant="outline" size="sm" asChild>
                                      <a href={project.url} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {project.startDate} - {project.endDate || 'Present'}
                                  {project.role && ` • ${project.role}`}
                                </p>
                                <p className="text-sm mb-3">{project.description}</p>
                                <div className="flex flex-wrap gap-1">
                                  {project.technologies.map((tech, techIndex) => (
                                    <Badge key={techIndex} variant="secondary" className="text-xs">
                                      {tech}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  /* No Public Resume Message */
                  <Card>
                    <CardContent className="text-center py-8">
                      <div className="flex justify-center mb-4">
                        <div className="p-3 bg-muted rounded-full">
                          <Briefcase className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                      <h3 className="font-semibold text-lg mb-2">Professional Details Private</h3>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto">
                        This user hasn't made their detailed professional information public yet.
                        You can still connect with them and see their basic profile information.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={`mailto:${person.data.contact.email}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {person.data.contact.email}
                      </a>
                    </div>
                    
                    {person.data.contact.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{person.data.contact.phone}</span>
                      </div>
                    )}
                    
                    {person.data.contact.website && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={person.data.contact.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          {person.data.contact.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    
                    {person.data.contact.linkedin && (
                      <div className="flex items-center gap-3">
                        <Linkedin className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={person.data.contact.linkedin} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          LinkedIn
                        </a>
                      </div>
                    )}
                    
                    {person.data.contact.github && (
                      <div className="flex items-center gap-3">
                        <Github className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={person.data.contact.github} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          GitHub
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Additional Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {person.data.languages && person.data.languages.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Languages</h4>
                        <div className="flex flex-wrap gap-1">
                          {person.data.languages.map((language, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {language}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {person.data.interests && person.data.interests.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Interests</h4>
                        <div className="flex flex-wrap gap-1">
                          {person.data.interests.map((interest, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {interest}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Member since</span>
                        <span>{new Date(person.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last active</span>
                        <span>{new Date(person.lastActiveAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Opportunity Preferences (if open to work) */}
                {person.data.openToWork && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-green-700">Open to Opportunities</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {person.data.openToOpportunities.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">Opportunity Types</h4>
                          <div className="flex flex-wrap gap-1">
                            {person.data.openToOpportunities.map((type, index) => (
                              <Badge key={index} variant="outline" className="text-xs capitalize">
                                {type.replace('-', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {person.data.preferredRoles && person.data.preferredRoles.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">Preferred Roles</h4>
                          <div className="space-y-1">
                            {person.data.preferredRoles.map((role, index) => (
                              <div key={index} className="text-xs text-muted-foreground">
                                • {role}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {person.data.salaryExpectation && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">Salary Expectation</h4>
                          <p className="text-xs text-muted-foreground">
                            {person.data.salaryExpectation.min && person.data.salaryExpectation.max 
                              ? `$${(person.data.salaryExpectation.min / 1000).toFixed(0)}k - $${(person.data.salaryExpectation.max / 1000).toFixed(0)}k ${person.data.salaryExpectation.currency}`
                              : 'Negotiable'}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>


    </div>
  );
}
