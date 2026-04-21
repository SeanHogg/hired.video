import {
  User,
  Briefcase,
  GraduationCap,
  Award,
  FileText,
  Save,
  Heart,
  FolderOpen,
  Globe,
  Trophy,
  BookOpen,
  Lightbulb,
  UserCheck,
} from "lucide-react";
import { useState , useEffect } from "react";
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
  Work,
  Education,
  Skill,
  Volunteer,
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
  onSave: (request: CreateResumeRequest) => Promise<void> | void;
  onCancel: () => void;
  initialData?: Partial<ResumeData>;
  initialName?: string;
  initialPrivacy?: ResumePrivacy;
  initialIsMaster?: boolean;
  initialSlug?: string;
  /** Which tab to open on mount (e.g. "work", "education"). Defaults to "basics". */
  initialTab?: string;
}

export default function ResumeBuilder({
  onSave,
  onCancel,
  initialData,
  initialName = "",
  initialPrivacy = "private",
  initialIsMaster = false,
  initialSlug = "",
  initialTab = "basics",
}: ResumeBuilderProps) {
  const [resumeName, setResumeName] = useState(initialName);
  const [privacy, setPrivacy] = useState<ResumePrivacy>(initialPrivacy);
  const [isMaster, setIsMaster] = useState(initialIsMaster);
  const [slug, setSlug] = useState<string>(initialSlug);

  const tryUuid = () => (typeof crypto !== "undefined" && 'randomUUID' in crypto ? (crypto).randomUUID() : `${Math.random().toString(16).slice(2)}-${Date.now()}`);

  // Ensure section Ids exist at mount so Reference dropdown has options immediately
  useEffect(() => {
    ensureIdsForSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureIdsForSections = () => {
    // Basics
    setBasics(prev => ({
      ...prev,
      id: prev.id || tryUuid(),
    }));
    // Work
    setWork(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Education
    setEducation(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Skills
    setSkills(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Volunteer
    setVolunteer(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Awards
    setAwards(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Certificates
    setCertificates(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Publications
    setPublications(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Languages
    setLanguages(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Interests
    setInterests(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // References
    setReferences(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
    // Projects
    setProjects(prev => prev.map(item => ({
      ...item,
      id: item.id || tryUuid(),
    })));
  };





  const [basics, setBasics] = useState({
    name: "",
    label: "",
    image: "",
    email: "",
    phone: "",
    url: "",
    summary: "",
    location: null,
    ...initialData?.basics,
  });

  const [work, setWork] = useState<Work[]>(initialData?.work || []);

  // Sort work experience chronologically (current positions first, then by most recent)
  const sortWorkExperience = (workArray: Work[]) => {
    return workArray.slice().sort((a, b) => {
      // Current positions (no end date) come first
      const aIsCurrent = !a.endDate || a.endDate === '';
      const bIsCurrent = !b.endDate || b.endDate === '';

      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;

      // For positions with end dates, sort by end date descending (most recent first)
      if (!aIsCurrent && !bIsCurrent) {
        const aEndDate = new Date(a.endDate);
        const bEndDate = new Date(b.endDate);
        return bEndDate.getTime() - aEndDate.getTime();
      }

      // For current positions, sort by start date descending (most recent first)
      const aStartDate = new Date(a.startDate);
      const bStartDate = new Date(b.startDate);
      return bStartDate.getTime() - aStartDate.getTime();
    });
  };
  const [education, setEducation] = useState<Education[]>(
    initialData?.education || [],
  );
  const [skills, setSkills] = useState<Skill[]>(initialData?.skills || []);
  const [volunteer, setVolunteer] = useState<Volunteer[]>(
    initialData?.volunteer || [],
  );
  const [languages, setLanguages] = useState<Language[]>(
    initialData?.languages || [],
  );
  const [interests, setInterests] = useState<Interest[]>(
    initialData?.interests || [],
  );
  const [references, setReferences] = useState<Reference[]>(
    initialData?.references || [],
  );
  const [projects, setProjects] = useState<Project[]>(
    initialData?.projects || [],
  );
  const [awards, setAwards] = useState<AwardType[]>(initialData?.awards || []);
  const [certificates, setCertificates] = useState<Certificate[]>(
    initialData?.certificates || [],
  );
  const [publications, setPublications] = useState<Publication[]>(
    initialData?.publications || [],
  );

  const addWorkExperience = () => {
    setWork([
      ...work,
      {
        name: "",
        position: "",
        summary: "",
        startDate: "",
        endDate: "",
        highlights: [],
        url: "",
      },
    ]);
  };

  const updateWorkExperience = (
    index: number,
    field: keyof Work,
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
        institution: "",
        area: "",
        studyType: "",
        startDate: "",
        endDate: "",
        score: "",
        courses: null,
        url: "",
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
        name: "",
        level: "",
        keywords: [],
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
        organization: "",
        position: "",
        summary: "",
        startDate: "",
        endDate: "",
        highlights: null,
        url: "",
      },
    ]);
  };

  const updateVolunteer = (
    index: number,
    field: keyof Volunteer,
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
        language: "",
        fluency: "",
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
        name: "",
        keywords: [],
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
        name: "",
        reference: "",
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
        name: "",
        description: "",
        highlights: [],
        keywords: [],
        startDate: "",
        endDate: "",
        url: "",
        roles: [],
        entity: "",
        type: "",
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
        title: "",
        date: "",
        awarder: "",
        summary: "",
      },
    ]);
  };

  const updateAward = (
    index: number,
    field: keyof AwardType,
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
        name: "",
        date: "",
        issuer: "",
        url: "",
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
        name: "",
        publisher: "",
        releaseDate: "",
        url: "",
        summary: "",
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
    updatedWork[workIndex].highlights.push("");
    setWork(updatedWork);
  };

  const updateHighlight = (
    workIndex: number,
    highlightIndex: number,
    value: string,
  ) => {
    const updatedWork = [...work];
    updatedWork[workIndex].highlights[highlightIndex] = value;
    setWork(updatedWork);
  };

  const removeHighlight = (workIndex: number, highlightIndex: number) => {
    const updatedWork = [...work];
    updatedWork[workIndex].highlights.splice(highlightIndex, 1);
    setWork(updatedWork);
  };
  const [saving, setSaving] = useState(false);


  const handleSave = async () => {
    // Allow saving if we have a resume name OR if we're editing an existing resume (initialName exists)
    if (!resumeName.trim() && !initialName) return;
    if (!basics.name.trim()) return;

    setSaving(true);
    try {
      // Ensure sections have UUIDs for metadata association
      ensureIdsForSections();

      const content: ResumeData = {
        basics: basics,
        work: work,
        volunteer: volunteer,
        education: education,
        awards: awards,
        certificates: certificates,
        publications: publications,
        skills: skills,
        languages: languages,
        interests: interests,
        references: references,
        projects: projects,
        metaData: [],
      };

      const request: CreateResumeRequest = {
        title: resumeName.trim() || initialName,
        content,
        status: "draft",
        privacy,
        isMaster,
        isActive: false,
        slug: slug?.trim() || undefined,
      };

      await onSave(request);
    } finally {
      setSaving(false);
    }
  };

  // Check if the form is valid for saving
  const isFormValid = () => {
    return basics.name.trim() && (resumeName.trim() || initialName);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resume Builder
          </CardTitle>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isFormValid() || saving}
            >
              {saving ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="slug">Custom URL (Slug)</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g., john-smith-cto"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only. Leave blank to keep the current value or default.
              </p>
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

      <Tabs defaultValue={initialTab} className="w-full">
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
                    value={basics.name}
                    onChange={(e) =>
                      setBasics({ ...basics, name: e.target.value })
                    }
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Professional Title</Label>
                  <Input
                    id="label"
                    value={basics.label}
                    onChange={(e) =>
                      setBasics({ ...basics, label: e.target.value })
                    }
                    placeholder="Software Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={basics.email}
                    onChange={(e) =>
                      setBasics({ ...basics, email: e.target.value })
                    }
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={basics.phone}
                    onChange={(e) =>
                      setBasics({ ...basics, phone: e.target.value })
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Website/Portfolio</Label>
                  <Input
                    id="url"
                    value={basics.url}
                    onChange={(e) =>
                      setBasics({ ...basics, url: e.target.value })
                    }
                    placeholder="https://johndoe.dev"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Professional Summary</Label>
                <Textarea
                  id="summary"
                  value={basics.summary}
                  onChange={(e) =>
                    setBasics({ ...basics, summary: e.target.value })
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
            sortedWork={sortWorkExperience(work)}
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

    </div>
  );
}
