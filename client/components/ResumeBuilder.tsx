import { 
  User, 
  Briefcase, 
  GraduationCap, 
  Award, 
  FileText, 
  Plus, 
  Trash2, 
  Save,
  X
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { ResumeData, ResumePrivacy, CreateResumeRequest, WorkExperience, Education, Skill } from '@/types/resume';

interface ResumeBuilderProps {
  onSave: (request: CreateResumeRequest) => void;
  onCancel: () => void;
  initialData?: Partial<ResumeData>;
}

export default function ResumeBuilder({ onSave, onCancel, initialData }: ResumeBuilderProps) {
  const [resumeName, setResumeName] = useState('');
  const [privacy, setPrivacy] = useState<ResumePrivacy>('private');
  const [isMaster, setIsMaster] = useState(false);
  
  const [basics, setBasics] = useState({
    Name: '',
    Label: '',
    Image: '',
    Email: '',
    Phone: '',
    Url: '',
    Summary: '',
    Location: null,
    ...initialData?.Basics
  });

  const [work, setWork] = useState<WorkExperience[]>(initialData?.Work || []);
  const [education, setEducation] = useState<Education[]>(initialData?.Education || []);
  const [skills, setSkills] = useState<Skill[]>(initialData?.Skills || []);

  const addWorkExperience = () => {
    setWork([...work, {
      Name: '',
      Position: '',
      Summary: '',
      StartDate: '',
      EndDate: '',
      Highlights: [],
      Url: ''
    }]);
  };

  const updateWorkExperience = (index: number, field: keyof WorkExperience, value: any) => {
    const updatedWork = [...work];
    updatedWork[index] = { ...updatedWork[index], [field]: value };
    setWork(updatedWork);
  };

  const removeWorkExperience = (index: number) => {
    setWork(work.filter((_, i) => i !== index));
  };

  const addEducation = () => {
    setEducation([...education, {
      Institution: '',
      Area: '',
      StudyType: '',
      StartDate: '',
      EndDate: '',
      Score: '',
      Courses: null,
      Url: ''
    }]);
  };

  const updateEducation = (index: number, field: keyof Education, value: any) => {
    const updatedEducation = [...education];
    updatedEducation[index] = { ...updatedEducation[index], [field]: value };
    setEducation(updatedEducation);
  };

  const removeEducation = (index: number) => {
    setEducation(education.filter((_, i) => i !== index));
  };

  const addSkill = () => {
    setSkills([...skills, {
      Name: '',
      Level: '',
      Keywords: []
    }]);
  };

  const updateSkill = (index: number, field: keyof Skill, value: any) => {
    const updatedSkills = [...skills];
    updatedSkills[index] = { ...updatedSkills[index], [field]: value };
    setSkills(updatedSkills);
  };

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  const addHighlight = (workIndex: number) => {
    const updatedWork = [...work];
    updatedWork[workIndex].Highlights.push('');
    setWork(updatedWork);
  };

  const updateHighlight = (workIndex: number, highlightIndex: number, value: string) => {
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
      Volunteer: [],
      Education: education,
      Awards: [],
      Certificates: [],
      Publications: [],
      Skills: skills,
      Languages: [],
      Interests: [],
      References: [],
      Projects: []
    };

    const request: CreateResumeRequest = {
      name: resumeName.trim(),
      data: resumeData,
      privacy,
      isMaster
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
              <Select value={privacy} onValueChange={(value: ResumePrivacy) => setPrivacy(value)}>
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basics" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Basics
          </TabsTrigger>
          <TabsTrigger value="work" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Work
          </TabsTrigger>
          <TabsTrigger value="education" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Education
          </TabsTrigger>
          <TabsTrigger value="skills" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Skills
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
                    onChange={(e) => setBasics({ ...basics, Name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Professional Title</Label>
                  <Input
                    id="label"
                    value={basics.Label}
                    onChange={(e) => setBasics({ ...basics, Label: e.target.value })}
                    placeholder="Software Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={basics.Email}
                    onChange={(e) => setBasics({ ...basics, Email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={basics.Phone}
                    onChange={(e) => setBasics({ ...basics, Phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Website/Portfolio</Label>
                  <Input
                    id="url"
                    value={basics.Url}
                    onChange={(e) => setBasics({ ...basics, Url: e.target.value })}
                    placeholder="https://johndoe.dev"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Professional Summary</Label>
                <Textarea
                  id="summary"
                  value={basics.Summary}
                  onChange={(e) => setBasics({ ...basics, Summary: e.target.value })}
                  placeholder="Brief overview of your professional background and key achievements..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Work Experience</CardTitle>
              <Button onClick={addWorkExperience} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Experience
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {work.map((exp, index) => (
                <div key={index} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Experience {index + 1}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWorkExperience(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input
                        value={exp.Name}
                        onChange={(e) => updateWorkExperience(index, 'Name', e.target.value)}
                        placeholder="Company Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Position</Label>
                      <Input
                        value={exp.Position}
                        onChange={(e) => updateWorkExperience(index, 'Position', e.target.value)}
                        placeholder="Job Title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="month"
                        value={exp.StartDate}
                        onChange={(e) => updateWorkExperience(index, 'StartDate', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="month"
                        value={exp.EndDate}
                        onChange={(e) => updateWorkExperience(index, 'EndDate', e.target.value)}
                        placeholder="Leave empty if current"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Job Summary</Label>
                    <Textarea
                      value={exp.Summary}
                      onChange={(e) => updateWorkExperience(index, 'Summary', e.target.value)}
                      placeholder="Brief description of your role and responsibilities..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Key Achievements</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addHighlight(index)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Achievement
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {exp.Highlights.map((highlight, highlightIndex) => (
                        <div key={highlightIndex} className="flex gap-2">
                          <Input
                            value={highlight}
                            onChange={(e) => updateHighlight(index, highlightIndex, e.target.value)}
                            placeholder="Achievement or responsibility..."
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeHighlight(index, highlightIndex)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              
              {work.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No work experience added yet.</p>
                  <p className="text-sm">Click "Add Experience" to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="education">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Education</CardTitle>
              <Button onClick={addEducation} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Education
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {education.map((edu, index) => (
                <div key={index} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Education {index + 1}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEducation(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Institution</Label>
                      <Input
                        value={edu.Institution}
                        onChange={(e) => updateEducation(index, 'Institution', e.target.value)}
                        placeholder="University Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Degree Type</Label>
                      <Select
                        value={edu.StudyType}
                        onValueChange={(value) => updateEducation(index, 'StudyType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select degree type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bachelor">Bachelor's</SelectItem>
                          <SelectItem value="Master">Master's</SelectItem>
                          <SelectItem value="PhD">PhD</SelectItem>
                          <SelectItem value="Associate">Associate</SelectItem>
                          <SelectItem value="Certificate">Certificate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Field of Study</Label>
                      <Input
                        value={edu.Area}
                        onChange={(e) => updateEducation(index, 'Area', e.target.value)}
                        placeholder="Computer Science"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GPA/Score</Label>
                      <Input
                        value={edu.Score}
                        onChange={(e) => updateEducation(index, 'Score', e.target.value)}
                        placeholder="3.8 / 4.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="month"
                        value={edu.StartDate}
                        onChange={(e) => updateEducation(index, 'StartDate', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="month"
                        value={edu.EndDate}
                        onChange={(e) => updateEducation(index, 'EndDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {education.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No education added yet.</p>
                  <p className="text-sm">Click "Add Education" to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skills">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Skills</CardTitle>
              <Button onClick={addSkill} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Skill
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {skills.map((skill, index) => (
                <div key={index} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Skill {index + 1}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSkill(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Skill Name</Label>
                      <Input
                        value={skill.Name}
                        onChange={(e) => updateSkill(index, 'Name', e.target.value)}
                        placeholder="JavaScript"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Proficiency Level</Label>
                      <Select
                        value={skill.Level}
                        onValueChange={(value) => updateSkill(index, 'Level', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Beginner">Beginner</SelectItem>
                          <SelectItem value="Intermediate">Intermediate</SelectItem>
                          <SelectItem value="Advanced">Advanced</SelectItem>
                          <SelectItem value="Expert">Expert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              
              {skills.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No skills added yet.</p>
                  <p className="text-sm">Click "Add Skill" to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!resumeName.trim() || !basics.Name.trim()}>
          <Save className="mr-2 h-4 w-4" />
          Save Resume
        </Button>
      </div>
    </div>
  );
}
