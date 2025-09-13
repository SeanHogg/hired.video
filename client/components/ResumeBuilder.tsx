import {
  User,
  Briefcase,
  GraduationCap,
  Award,
  FileText,
  Plus,
  Trash2,
  Save,
  X,
  Heart,
  FolderOpen,
  Globe,
  Trophy,
  BookOpen,
  Lightbulb,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  ResumeData,
  ResumePrivacy,
  CreateResumeRequest,
  WorkExperience,
  Education,
  Skill,
  VolunteerExperience,
  Language,
  Interest,
  Reference,
  Project,
  Award as AwardType,
  Certificate,
  Publication,
} from "@/types/resume";
import {
  WorkExperienceSection,
  EducationSection,
  SkillsSection,
  VolunteerSection,
  LanguagesSection,
  ProjectsSection,
  AwardsSection,
  CertificatesSection,
  PublicationsSection,
  InterestsSection,
  ReferencesSection,
} from "@/components/resume-sections";

interface ResumeBuilderProps {
  onSave: (request: CreateResumeRequest) => void;
  onCancel: () => void;
  initialData?: Partial<ResumeData>;
}

export default function ResumeBuilder({
  onSave,
  onCancel,
  initialData,
}: ResumeBuilderProps) {
  const [resumeName, setResumeName] = useState("");
  const [privacy, setPrivacy] = useState<ResumePrivacy>("private");
  const [isMaster, setIsMaster] = useState(false);

  const [basics, setBasics] = useState({
    Name: "",
    Label: "",
    Image: "",
    Email: "",
    Phone: "",
    Url: "",
    Summary: "",
    Location: null,
    ...initialData?.Basics,
  });

  const [work, setWork] = useState<WorkExperience[]>(initialData?.Work || []);
  const [education, setEducation] = useState<Education[]>(
    initialData?.Education || [],
  );
  const [skills, setSkills] = useState<Skill[]>(initialData?.Skills || []);
  const [volunteer, setVolunteer] = useState<VolunteerExperience[]>(
    initialData?.Volunteer || [],
  );
  const [languages, setLanguages] = useState<Language[]>(
    initialData?.Languages || [],
  );
  const [interests, setInterests] = useState<Interest[]>(
    initialData?.Interests || [],
  );
  const [references, setReferences] = useState<Reference[]>(
    initialData?.References || [],
  );
  const [projects, setProjects] = useState<Project[]>(
    initialData?.Projects || [],
  );
  const [awards, setAwards] = useState<Award[]>(initialData?.Awards || []);
  const [certificates, setCertificates] = useState<Certificate[]>(
    initialData?.Certificates || [],
  );
  const [publications, setPublications] = useState<Publication[]>(
    initialData?.Publications || [],
  );

  const addWorkExperience = () => {
    setWork([
      ...work,
      {
        Name: "",
        Position: "",
        Summary: "",
        StartDate: "",
        EndDate: "",
        Highlights: [],
        Url: "",
      },
    ]);
  };

  const updateWorkExperience = (
    index: number,
    field: keyof WorkExperience,
    value: string | string[],
  ) => {
    const updatedWork = [...work];
    updatedWork[index] = { ...updatedWork[index], [field]: value };
    setWork(updatedWork);
  };

  const removeWorkExperience = (index: number) => {
    setWork(work.filter((_, i) => i !== index));
  };

  const addEducation = () => {
    setEducation([
      ...education,
      {
        Institution: "",
        Area: "",
        StudyType: "",
        StartDate: "",
        EndDate: "",
        Score: "",
        Courses: null,
        Url: "",
      },
    ]);
  };

  const updateEducation = (
    index: number,
    field: keyof Education,
    value: string | string[] | null,
  ) => {
    const updatedEducation = [...education];
    updatedEducation[index] = { ...updatedEducation[index], [field]: value };
    setEducation(updatedEducation);
  };

  const removeEducation = (index: number) => {
    setEducation(education.filter((_, i) => i !== index));
  };

  const addSkill = () => {
    setSkills([
      ...skills,
      {
        Name: "",
        Level: "",
        Keywords: [],
      },
    ]);
  };

  const updateSkill = (
    index: number,
    field: keyof Skill,
    value: string | string[],
  ) => {
    const updatedSkills = [...skills];
    updatedSkills[index] = { ...updatedSkills[index], [field]: value };
    setSkills(updatedSkills);
  };

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  // Volunteer Experience functions
  const addVolunteer = () => {
    setVolunteer([
      ...volunteer,
      {
        Organization: "",
        Position: "",
        Summary: "",
        StartDate: "",
        EndDate: "",
        Highlights: null,
        Url: "",
      },
    ]);
  };

  const updateVolunteer = (
    index: number,
    field: keyof VolunteerExperience,
    value: string | string[] | null,
  ) => {
    const updatedVolunteer = [...volunteer];
    updatedVolunteer[index] = { ...updatedVolunteer[index], [field]: value };
    setVolunteer(updatedVolunteer);
  };

  const removeVolunteer = (index: number) => {
    setVolunteer(volunteer.filter((_, i) => i !== index));
  };

  // Languages functions
  const addLanguage = () => {
    setLanguages([
      ...languages,
      {
        Language: "",
        Fluency: "",
      },
    ]);
  };

  const updateLanguage = (
    index: number,
    field: keyof Language,
    value: string,
  ) => {
    const updatedLanguages = [...languages];
    updatedLanguages[index] = { ...updatedLanguages[index], [field]: value };
    setLanguages(updatedLanguages);
  };

  const removeLanguage = (index: number) => {
    setLanguages(languages.filter((_, i) => i !== index));
  };

  // Interests functions
  const addInterest = () => {
    setInterests([
      ...interests,
      {
        Name: "",
        Keywords: [],
      },
    ]);
  };

  const updateInterest = (
    index: number,
    field: keyof Interest,
    value: string | string[],
  ) => {
    const updatedInterests = [...interests];
    updatedInterests[index] = { ...updatedInterests[index], [field]: value };
    setInterests(updatedInterests);
  };

  const removeInterest = (index: number) => {
    setInterests(interests.filter((_, i) => i !== index));
  };

  // References functions
  const addReference = () => {
    setReferences([
      ...references,
      {
        Name: "",
        Reference: "",
      },
    ]);
  };

  const updateReference = (
    index: number,
    field: keyof Reference,
    value: string,
  ) => {
    const updatedReferences = [...references];
    updatedReferences[index] = { ...updatedReferences[index], [field]: value };
    setReferences(updatedReferences);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  // Projects functions
  const addProject = () => {
    setProjects([
      ...projects,
      {
        Name: "",
        Description: "",
        Highlights: [],
        Keywords: [],
        StartDate: "",
        EndDate: "",
        Url: "",
        Roles: [],
        Entity: "",
        Type: "",
      },
    ]);
  };

  const updateProject = (
    index: number,
    field: keyof Project,
    value: string | string[],
  ) => {
    const updatedProjects = [...projects];
    updatedProjects[index] = { ...updatedProjects[index], [field]: value };
    setProjects(updatedProjects);
  };

  const removeProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  // Awards functions
  const addAward = () => {
    setAwards([
      ...awards,
      {
        Title: "",
        Date: "",
        Awarder: "",
        Summary: "",
      },
    ]);
  };

  const updateAward = (
    index: number,
    field: keyof Award,
    value: string,
  ) => {
    const updatedAwards = [...awards];
    updatedAwards[index] = { ...updatedAwards[index], [field]: value };
    setAwards(updatedAwards);
  };

  const removeAward = (index: number) => {
    setAwards(awards.filter((_, i) => i !== index));
  };

  // Certificates functions
  const addCertificate = () => {
    setCertificates([
      ...certificates,
      {
        Name: "",
        Date: "",
        Issuer: "",
        Url: "",
      },
    ]);
  };

  const updateCertificate = (
    index: number,
    field: keyof Certificate,
    value: string,
  ) => {
    const updatedCertificates = [...certificates];
    updatedCertificates[index] = { ...updatedCertificates[index], [field]: value };
    setCertificates(updatedCertificates);
  };

  const removeCertificate = (index: number) => {
    setCertificates(certificates.filter((_, i) => i !== index));
  };

  // Publications functions
  const addPublication = () => {
    setPublications([
      ...publications,
      {
        Name: "",
        Publisher: "",
        ReleaseDate: "",
        Url: "",
        Summary: "",
      },
    ]);
  };

  const updatePublication = (
    index: number,
    field: keyof Publication,
    value: string,
  ) => {
    const updatedPublications = [...publications];
    updatedPublications[index] = { ...updatedPublications[index], [field]: value };
    setPublications(updatedPublications);
  };

  const removePublication = (index: number) => {
    setPublications(publications.filter((_, i) => i !== index));
  };

  const addHighlight = (workIndex: number) => {
    const updatedWork = [...work];
    updatedWork[workIndex].Highlights.push("");
    setWork(updatedWork);
  };

  const updateHighlight = (
    workIndex: number,
    highlightIndex: number,
    value: string,
  ) => {
    const updatedWork = [...work];
    updatedWork[workIndex].Highlights[highlightIndex] = value;
    setWork(updatedWork);
  };

  const removeHighlight = (workIndex: number, highlightIndex: number) => {
    const updatedWork = [...work];
    updatedWork[workIndex].Highlights.splice(highlightIndex, 1);
    setWork(updatedWork);
  };

  const handleSave = () => {
    if (!resumeName.trim() || !basics.Name.trim()) return;

    const resumeData: ResumeData = {
      Basics: basics,
      Work: work,
      Volunteer: volunteer,
      Education: education,
      Awards: awards,
      Certificates: certificates,
      Publications: publications,
      Skills: skills,
      Languages: languages,
      Interests: interests,
      References: references,
      Projects: projects,
    };

    const request: CreateResumeRequest = {
      name: resumeName.trim(),
      data: resumeData,
      privacy,
      isMaster,
    };

    onSave(request);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resume Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resume Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="resume-name">Resume Name</Label>
              <Input
                id="resume-name"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
                placeholder="e.g., Software Engineer Resume"
              />
            </div>
            <div className="space-y-2">
              <Label>Privacy Setting</Label>
              <Select
                value={privacy}
                onValueChange={(value: ResumePrivacy) => setPrivacy(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="recruiter_only">Recruiter Only</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="master-resume"
              checked={isMaster}
              onCheckedChange={(checked) => setIsMaster(checked === true)}
            />
            <Label htmlFor="master-resume" className="text-sm">
              Mark as Master Resume
            </Label>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="basics" className="w-full">
        <TabsList className="grid w-full grid-cols-6 lg:grid-cols-12">
          <TabsTrigger value="basics" className="flex items-center gap-1 text-xs">
            <User className="h-3 w-3" />
            Basics
          </TabsTrigger>
          <TabsTrigger value="work" className="flex items-center gap-1 text-xs">
            <Briefcase className="h-3 w-3" />
            Work
          </TabsTrigger>
          <TabsTrigger value="education" className="flex items-center gap-1 text-xs">
            <GraduationCap className="h-3 w-3" />
            Education
          </TabsTrigger>
          <TabsTrigger value="skills" className="flex items-center gap-1 text-xs">
            <Award className="h-3 w-3" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="volunteer" className="flex items-center gap-1 text-xs">
            <Heart className="h-3 w-3" />
            Volunteer
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-1 text-xs">
            <FolderOpen className="h-3 w-3" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="languages" className="flex items-center gap-1 text-xs">
            <Globe className="h-3 w-3" />
            Languages
          </TabsTrigger>
          <TabsTrigger value="awards" className="flex items-center gap-1 text-xs">
            <Trophy className="h-3 w-3" />
            Awards
          </TabsTrigger>
          <TabsTrigger value="certificates" className="flex items-center gap-1 text-xs">
            <FileText className="h-3 w-3" />
            Certificates
          </TabsTrigger>
          <TabsTrigger value="publications" className="flex items-center gap-1 text-xs">
            <BookOpen className="h-3 w-3" />
            Publications
          </TabsTrigger>
          <TabsTrigger value="interests" className="flex items-center gap-1 text-xs">
            <Lightbulb className="h-3 w-3" />
            Interests
          </TabsTrigger>
          <TabsTrigger value="references" className="flex items-center gap-1 text-xs">
            <UserCheck className="h-3 w-3" />
            References
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basics">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={basics.Name}
                    onChange={(e) =>
                      setBasics({ ...basics, Name: e.target.value })
                    }
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Professional Title</Label>
                  <Input
                    id="label"
                    value={basics.Label}
                    onChange={(e) =>
                      setBasics({ ...basics, Label: e.target.value })
                    }
                    placeholder="Software Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={basics.Email}
                    onChange={(e) =>
                      setBasics({ ...basics, Email: e.target.value })
                    }
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={basics.Phone}
                    onChange={(e) =>
                      setBasics({ ...basics, Phone: e.target.value })
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Website/Portfolio</Label>
                  <Input
                    id="url"
                    value={basics.Url}
                    onChange={(e) =>
                      setBasics({ ...basics, Url: e.target.value })
                    }
                    placeholder="https://johndoe.dev"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Professional Summary</Label>
                <Textarea
                  id="summary"
                  value={basics.Summary}
                  onChange={(e) =>
                    setBasics({ ...basics, Summary: e.target.value })
                  }
                  placeholder="Brief overview of your professional background and key achievements..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <WorkExperienceSection
            work={work}
            onAdd={addWorkExperience}
            onUpdate={updateWorkExperience}
            onRemove={removeWorkExperience}
            onAddHighlight={addHighlight}
            onUpdateHighlight={updateHighlight}
            onRemoveHighlight={removeHighlight}
          />
        </TabsContent>

        <TabsContent value="education">
          <EducationSection
            education={education}
            onAdd={addEducation}
            onUpdate={updateEducation}
            onRemove={removeEducation}
          />
        </TabsContent>

        <TabsContent value="skills">
          <SkillsSection
            skills={skills}
            onAdd={addSkill}
            onUpdate={updateSkill}
            onRemove={removeSkill}
          />
        </TabsContent>

        <TabsContent value="volunteer">
          <VolunteerSection
            volunteer={volunteer}
            onAdd={addVolunteer}
            onUpdate={updateVolunteer}
            onRemove={removeVolunteer}
          />
        </TabsContent>

        <TabsContent value="projects">
          <ProjectsSection
            projects={projects}
            onAdd={addProject}
            onUpdate={updateProject}
            onRemove={removeProject}
          />
        </TabsContent>

        <TabsContent value="languages">
          <LanguagesSection
            languages={languages}
            onAdd={addLanguage}
            onUpdate={updateLanguage}
            onRemove={removeLanguage}
          />
        </TabsContent>

        <TabsContent value="awards">
          <AwardsSection
            awards={awards}
            onAdd={addAward}
            onUpdate={updateAward}
            onRemove={removeAward}
          />
        </TabsContent>

        <TabsContent value="certificates">
          <CertificatesSection
            certificates={certificates}
            onAdd={addCertificate}
            onUpdate={updateCertificate}
            onRemove={removeCertificate}
          />
        </TabsContent>

        <TabsContent value="publications">
          <PublicationsSection
            publications={publications}
            onAdd={addPublication}
            onUpdate={updatePublication}
            onRemove={removePublication}
          />
        </TabsContent>

        <TabsContent value="interests">
          <InterestsSection
            interests={interests}
            onAdd={addInterest}
            onUpdate={updateInterest}
            onRemove={removeInterest}
          />
        </TabsContent>

        <TabsContent value="references">
          <ReferencesSection
            references={references}
            onAdd={addReference}
            onUpdate={updateReference}
            onRemove={removeReference}
          />
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!resumeName.trim() || !basics.Name.trim()}
        >
          <Save className="mr-2 h-4 w-4" />
          Save Resume
        </Button>
      </div>
    </div>
  );
}
