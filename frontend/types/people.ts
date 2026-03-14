export interface UserLocation {
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  remote?: boolean;
}

export interface UserContact {
  email: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  github?: string;
}

export interface UserExperience {
  title: string;
  company: string;
  companyId?: string;
  location?: string;
  startDate: string;
  endDate?: string; // null for current position
  description?: string;
  skills?: string[];
  technologies?: string[];
  highlights?: string[];
  achievements?: string[];
  isCurrent: boolean;
}

export interface UserEducation {
  institution?: string;
  school?: string; // Alternative name for institution
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
  description?: string;
}

export interface UserSkill {
  name: string;
  level: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  yearsOfExperience?: number;
  endorsed?: boolean;
  endorsements?: number;
}

export interface UserProject {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  link?: string; // Alternative name for url
  startDate: string;
  endDate?: string;
  role?: string;
}

export interface UserData {
  firstName: string;
  lastName: string;
  avatar?: string;
  headline: string; // Professional headline/title
  summary: string; // About section
  location: UserLocation;
  contact: UserContact;
  experience: UserExperience[];
  education: UserEducation[];
  skills: UserSkill[];
  projects: UserProject[];
  languages?: string[];
  interests?: string[];
  achievements?: string[];
  certifications?: string[];
  openToWork: boolean;
  openToOpportunities: string[]; // e.g., ['full-time', 'contract', 'part-time']
  preferredRoles?: string[];
  salaryExpectation?: {
    min?: number;
    max?: number;
    currency: string;
  };
}

export type UserVisibility = "public" | "network_only" | "private";
export type UserStatus = "active" | "inactive" | "busy" | "looking";

export interface UserSettings {
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    jobAlerts: boolean;
    messageAlerts: boolean;
    connectionRequests: boolean;
  };
  privacy: {
    profileVisibility: UserVisibility;
    showEmail: boolean;
    showPhone: boolean;
    showLocation: boolean;
    allowSearchEngineIndexing: boolean;
  };
  preferences: {
    language: string;
    timezone: string;
    currency: string;
    dateFormat: string;
    theme: "light" | "dark" | "system";
  };
  jobSearch?: {
    openToWork: boolean;
    jobTypes: string[];
    salaryRange: {
      min: number;
      max: number;
      currency: string;
    };
    preferredLocations: string[];
    remoteWork: boolean;
  };
}

export interface UserProfile {
  id: string;
  slug: string; // User-friendly URL identifier (e.g., "john-seeker" or "jane-doe-123")
  data: UserData;
  role: "job_seeker" | "recruiter" | "employer"; // System role
  visibility: UserVisibility;
  status: UserStatus;
  companyId?: string; // For recruiters/employer users
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  profileViews: number;
  connectionCount: number;
  followerCount: number;
  isVerified: boolean;
  isPremium: boolean;
  settings?: UserSettings;
}

export interface UserMetadata {
  id: string;
  slug: string; // User-friendly URL identifier
  firstName: string;
  lastName: string;
  fullName: string;
  avatar?: string;
  headline: string;
  location: string;
  role: string | number;
  visibility: UserVisibility;
  status: UserStatus;
  companyId?: string;
  companyName?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  profileViews: number;
  connectionCount: number;
  followerCount: number;
  emailConfirmed: boolean;
  isPremium: boolean;
  openToWork: boolean;
  experienceLevel?: string; // Derived from experience
  currentPosition?: string; // Current job title
  currentCompany?: string; // Current employer
}

export type UserOwnership = "owned" | "tracked" | "connected";

export interface UserWithOwnership extends UserMetadata {
  ownership: UserOwnership;
}

export type ConnectionStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "connected"
  | "blocked";

export interface Connection {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: ConnectionStatus;
  message?: string; // Connection request message
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  readAt?: string;
  messageType: "text" | "image" | "file" | "system";
}

export interface Conversation {
  id: string;
  participants: string[]; // Array of user IDs
  lastMessage?: Message;
  updatedAt: string;
  unreadCount: { [userId: string]: number };
}

export interface UserSearchFilters {
  location?: string;
  role?: string[];
  experience?: string;
  skills?: string[];
  company?: string;
  openToWork?: boolean;
  search?: string;
  status?: UserStatus;
  verified?: boolean;
}

export interface UserStats {
  totalViews: number;
  totalConnections: number;
  totalFollowers: number;
  profileCompleteness: number;
  searchAppearances: number;
  responseRate: number;
  avgResponseTime: number; // in hours
  topSkills: string[];
  viewsGrowth: Array<{ date: string; count: number }>;
  connectionsGrowth: Array<{ date: string; count: number }>;
}

// Helper types for connection actions
export interface SendConnectionRequest {
  toUserId: string;
  message?: string;
}

export interface ConnectionResponse {
  connectionId: string;
  accept: boolean;
}

export interface SendMessageRequest {
  toUserId: string;
  content: string;
  messageType?: "text" | "image" | "file";
}

// Derived data helpers
export const getUserFullName = (user: UserProfile | UserMetadata): string => {
  if ("data" in user) {
    return `${user.data.firstName} ${user.data.lastName}`;
  }
  return user.fullName;
};

export const getCurrentPosition = (user: UserProfile): string | undefined => {
  const currentExp = user.data.experience.find((exp) => exp.isCurrent);
  return currentExp
    ? `${currentExp.title} at ${currentExp.company}`
    : undefined;
};

export const getExperienceLevel = (user: UserProfile): string => {
  const totalYears = user.data.experience.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.endDate ? new Date(exp.endDate) : new Date();
    const years =
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return total + years;
  }, 0);

  if (totalYears < 2) return "Entry Level";
  if (totalYears < 5) return "Mid Level";
  if (totalYears < 10) return "Senior Level";
  return "Executive Level";
};

export const getProfileCompleteness = (user: UserProfile): number => {
  let score = 0;
  const weights = {
    basicInfo: 20, // name, headline, summary
    contact: 10,
    location: 5,
    experience: 25,
    education: 15,
    skills: 15,
    projects: 10,
  };

  // Basic info
  if (
    user.data.firstName &&
    user.data.lastName &&
    user.data.headline &&
    user.data.summary
  ) {
    score += weights.basicInfo;
  }

  // Contact
  if (user.data.contact.email) {
    score += weights.contact;
  }

  // Location
  if (user.data.location.city && user.data.location.country) {
    score += weights.location;
  }

  // Experience
  if (user.data.experience.length > 0) {
    score += weights.experience;
  }

  // Education
  if (user.data.education.length > 0) {
    score += weights.education;
  }

  // Skills
  if (user.data.skills.length >= 3) {
    score += weights.skills;
  }

  // Projects
  if (user.data.projects.length > 0) {
    score += weights.projects;
  }

  return Math.min(100, score);
};
