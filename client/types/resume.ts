export interface ResumeBasics {
  Name: string;
  Label: string;
  Image: string;
  Email: string;
  Phone: string;
  Url: string;
  Summary: string;
  Location: {
    Address?: string;
    PostalCode?: string;
    City?: string;
    CountryCode?: string;
    Region?: string;
  } | null;
}

export interface WorkExperience {
  Name: string;
  Position: string;
  Summary: string;
  StartDate: string;
  EndDate: string;
  Highlights: string[];
  Url: string;
}

export interface VolunteerExperience {
  Organization: string;
  Position: string;
  Summary: string;
  StartDate: string;
  EndDate: string;
  Highlights: string[] | null;
  Url: string;
}

export interface Education {
  Institution: string;
  Area: string;
  StudyType: string;
  StartDate: string;
  EndDate: string;
  Score: string;
  Courses: string[] | null;
  Url: string;
}

export interface Award {
  Title: string;
  Date: string;
  Awarder: string;
  Summary: string;
}

export interface Certificate {
  Name: string;
  Date: string;
  Issuer: string;
  Url: string;
}

export interface Publication {
  Name: string;
  Publisher: string;
  ReleaseDate: string;
  Url: string;
  Summary: string;
}

export interface Skill {
  Name: string;
  Level: string;
  Keywords: string[];
}

export interface Language {
  Language: string;
  Fluency: string;
}

export interface Interest {
  Name: string;
  Keywords: string[];
}

export interface Reference {
  Name: string;
  Reference: string;
}

export interface Project {
  Name: string;
  Description: string;
  Highlights: string[];
  Keywords: string[];
  StartDate: string;
  EndDate: string;
  Url: string;
  Roles: string[];
  Entity: string;
  Type: string;
}

export interface ResumeData {
  Basics: ResumeBasics;
  Work: WorkExperience[];
  Volunteer: VolunteerExperience[];
  Education: Education[];
  Awards: Award[];
  Certificates: Certificate[];
  Publications: Publication[];
  Skills: Skill[];
  Languages: Language[];
  Interests: Interest[];
  References: Reference[];
  Projects: Project[];
}

export type ResumePrivacy = 'public' | 'recruiter_only' | 'private' | 'draft';

export interface Resume {
  id: string;
  slug: string; // User-friendly URL identifier (e.g., "john-seeker-cto-resume")
  name: string;
  data: ResumeData;
  privacy: ResumePrivacy;
  isMaster: boolean;
  isActive: boolean; // Only one resume can be active per user
  parentId?: string; // For variations
  createdAt: string;
  updatedAt: string;
  views: number;
  userId: string;
}

export interface ResumeMetadata {
  id: string;
  slug: string; // User-friendly URL identifier
  name: string;
  privacy: ResumePrivacy;
  isMaster: boolean;
  isActive: boolean;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  views: number;
  summary: string; // Derived from basics.summary
  title: string; // Derived from basics.label
  userId: string;
}

export type ResumeOwnership = 'owned' | 'tracked';

export interface ResumeWithOwnership extends ResumeMetadata {
  ownership: ResumeOwnership;
}

export interface CreateResumeRequest {
  name: string;
  data: ResumeData;
  privacy?: ResumePrivacy;
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string;
}

export interface UpdateResumeRequest {
  name?: string;
  data?: ResumeData;
  privacy?: ResumePrivacy;
  isMaster?: boolean;
  isActive?: boolean;
}

export interface UploadResumeRequest {
  name: string;
  file: File;
  privacy?: ResumePrivacy;
  isMaster?: boolean;
}

export interface ResumeSearchFilters {
  privacy?: ResumePrivacy;
  isMaster?: boolean;
  parentId?: string;
  search?: string;
}

export interface ResumeUploadResponse {
  id: string;
  data: ResumeData;
  message: string;
  confidence: number; // How confident the AI is in the extraction
}
