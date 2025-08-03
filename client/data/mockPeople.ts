import { 
  UserProfile, 
  UserMetadata, 
  UserWithOwnership, 
  Connection, 
  ConnectionStatus,
  Message,
  Conversation,
  getUserFullName,
  getCurrentPosition,
  getExperienceLevel,
  getProfileCompleteness
} from '@/types/people';

// Generate consistent UUIDs for mock people data
export const MOCK_PEOPLE_IDS = {
  JOHN_SEEKER: '1', // Existing user from auth
  SARAH_RECRUITER: '2', // Existing user from auth
  MICHAEL_BUSINESS: '3', // Existing user from auth
  ALEX_THOMPSON: 'u4a5b6c7-d8e9-0123-4567-890123456789',
  MARIA_GARCIA: 'u5b6c7d8-e9f0-1234-5678-901234567890',
  JAMES_WILSON: 'u6c7d8e9-f0g1-2345-6789-012345678901',
  LISA_CHEN: 'u7d8e9f0-g1h2-3456-7890-123456789012',
  DAVID_KUMAR: 'u8e9f0g1-h2i3-4567-8901-234567890123',
  EMILY_RODRIGUEZ: 'u9f0g1h2-i3j4-5678-9012-345678901234',
  CHRIS_TAYLOR: 'u0g1h2i3-j4k5-6789-0123-456789012345'
} as const;

export const MOCK_USERS: UserProfile[] = [
  {
    id: MOCK_PEOPLE_IDS.JOHN_SEEKER,
    data: {
      firstName: 'John',
      lastName: 'Seeker',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
      headline: 'Senior Full Stack Developer | React & Node.js Expert',
      summary: 'Passionate full stack developer with 8+ years of experience building scalable web applications. Specialized in React, Node.js, and cloud technologies. Currently seeking new opportunities to work with innovative teams on challenging projects.',
      location: {
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        remote: true
      },
      contact: {
        email: 'john.seeker@example.com',
        linkedin: 'https://linkedin.com/in/johnseeker',
        github: 'https://github.com/johnseeker',
        website: 'https://johnseeker.dev'
      },
      experience: [
        {
          title: 'Senior Software Engineer',
          company: 'TechCorp Inc.',
          companyId: 'techcorp-inc',
          location: 'San Francisco, CA',
          startDate: '2022-01-01',
          description: 'Lead frontend development for enterprise SaaS platform serving 100K+ users. Built responsive React applications with TypeScript and implemented CI/CD pipelines.',
          skills: ['React', 'TypeScript', 'Node.js', 'AWS'],
          isCurrent: true
        },
        {
          title: 'Full Stack Developer',
          company: 'StartupXYZ',
          location: 'San Francisco, CA',
          startDate: '2020-03-01',
          endDate: '2021-12-31',
          description: 'Developed full stack web applications using React and Node.js. Collaborated with product team to deliver user-centered features.',
          skills: ['React', 'Node.js', 'MongoDB', 'Express'],
          isCurrent: false
        },
        {
          title: 'Frontend Developer',
          company: 'Digital Agency Co.',
          location: 'Los Angeles, CA',
          startDate: '2018-06-01',
          endDate: '2020-02-28',
          description: 'Created responsive websites and web applications for various clients. Focused on modern JavaScript frameworks and performance optimization.',
          skills: ['JavaScript', 'Vue.js', 'CSS', 'HTML'],
          isCurrent: false
        }
      ],
      education: [
        {
          institution: 'University of California, Berkeley',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          startDate: '2014-09-01',
          endDate: '2018-05-31',
          gpa: '3.7'
        }
      ],
      skills: [
        { name: 'React', level: 'Expert', yearsOfExperience: 6, endorsements: 23 },
        { name: 'Node.js', level: 'Advanced', yearsOfExperience: 5, endorsements: 18 },
        { name: 'TypeScript', level: 'Advanced', yearsOfExperience: 4, endorsements: 15 },
        { name: 'AWS', level: 'Intermediate', yearsOfExperience: 3, endorsements: 12 },
        { name: 'MongoDB', level: 'Intermediate', yearsOfExperience: 4, endorsements: 10 }
      ],
      projects: [
        {
          name: 'E-commerce Platform',
          description: 'Built a full-featured e-commerce platform with React, Node.js, and Stripe integration',
          technologies: ['React', 'Node.js', 'MongoDB', 'Stripe'],
          url: 'https://github.com/johnseeker/ecommerce',
          startDate: '2023-01-01',
          endDate: '2023-06-01',
          role: 'Full Stack Developer'
        }
      ],
      languages: ['English (Native)', 'Spanish (Conversational)'],
      interests: ['Open Source', 'Machine Learning', 'Rock Climbing'],
      openToWork: true,
      openToOpportunities: ['full-time', 'contract'],
      preferredRoles: ['Senior Software Engineer', 'Tech Lead', 'Full Stack Developer'],
      salaryExpectation: {
        min: 120000,
        max: 160000,
        currency: 'USD'
      }
    },
    role: 'job_seeker',
    visibility: 'public',
    status: 'looking',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-30T10:00:00Z',
    lastActiveAt: '2024-01-30T10:00:00Z',
    profileViews: 156,
    connectionCount: 89,
    followerCount: 23,
    isVerified: true,
    isPremium: false
  },
  {
    id: MOCK_PEOPLE_IDS.SARAH_RECRUITER,
    data: {
      firstName: 'Sarah',
      lastName: 'Chen',
      avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
      headline: 'Senior Technical Recruiter | Helping Startups Build Amazing Teams',
      summary: 'Experienced technical recruiter with 6+ years helping startups and scale-ups build world-class engineering teams. Specialized in full-stack, DevOps, and data engineering roles. Passionate about connecting great talent with innovative companies.',
      location: {
        city: 'Austin',
        state: 'TX',
        country: 'USA',
        remote: true
      },
      contact: {
        email: 'sarah.chen@techcorp.com',
        linkedin: 'https://linkedin.com/in/sarahchen-recruiter',
        phone: '+1-512-555-0123'
      },
      experience: [
        {
          title: 'Senior Technical Recruiter',
          company: 'TechCorp Inc.',
          companyId: 'techcorp-inc',
          location: 'Austin, TX',
          startDate: '2021-06-01',
          description: 'Lead technical recruiting for engineering teams. Built hiring processes and sourced top talent for React, Node.js, and DevOps positions.',
          skills: ['Technical Recruiting', 'Talent Sourcing', 'Interview Coordination'],
          isCurrent: true
        },
        {
          title: 'Technical Recruiter',
          company: 'Startup Talent Co.',
          location: 'Austin, TX',
          startDate: '2019-03-01',
          endDate: '2021-05-31',
          description: 'Recruited engineering talent for various startup clients. Specialized in finding hard-to-fill technical positions.',
          skills: ['Recruiting', 'Startup Recruiting', 'Technical Screening'],
          isCurrent: false
        }
      ],
      education: [
        {
          institution: 'University of Texas at Austin',
          degree: 'Bachelor of Business Administration',
          field: 'Human Resources',
          startDate: '2015-09-01',
          endDate: '2019-05-31',
          gpa: '3.8'
        }
      ],
      skills: [
        { name: 'Technical Recruiting', level: 'Expert', yearsOfExperience: 6, endorsements: 45 },
        { name: 'Talent Sourcing', level: 'Expert', yearsOfExperience: 6, endorsements: 38 },
        { name: 'Interview Coordination', level: 'Advanced', yearsOfExperience: 5, endorsements: 28 }
      ],
      projects: [],
      languages: ['English (Native)', 'Mandarin (Native)'],
      interests: ['Talent Development', 'Startup Ecosystem', 'Yoga'],
      openToWork: false,
      openToOpportunities: [],
      preferredRoles: []
    },
    role: 'recruiter',
    visibility: 'public',
    status: 'active',
    companyId: 'techcorp-inc',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-30T10:00:00Z',
    lastActiveAt: '2024-01-30T09:30:00Z',
    profileViews: 234,
    connectionCount: 567,
    followerCount: 89,
    isVerified: true,
    isPremium: true
  },
  {
    id: MOCK_PEOPLE_IDS.MICHAEL_BUSINESS,
    data: {
      firstName: 'Michael',
      lastName: 'Rodriguez',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      headline: 'VP of Engineering | Building Scalable Teams & Products',
      summary: 'Engineering leader with 12+ years of experience building and scaling engineering teams from 5 to 50+ engineers. Expertise in distributed systems, team management, and product development. Currently leading engineering at Growth Dynamics.',
      location: {
        city: 'New York',
        state: 'NY',
        country: 'USA',
        remote: false
      },
      contact: {
        email: 'michael.rodriguez@growthdynamics.com',
        linkedin: 'https://linkedin.com/in/michaelrodriguez-eng',
        website: 'https://michaelrodriguez.engineering'
      },
      experience: [
        {
          title: 'VP of Engineering',
          company: 'Growth Dynamics',
          companyId: 'growth-dynamics',
          location: 'New York, NY',
          startDate: '2022-03-01',
          description: 'Lead engineering organization of 45+ engineers. Responsible for technical strategy, team scaling, and product delivery across multiple business units.',
          skills: ['Engineering Leadership', 'Team Scaling', 'Technical Strategy', 'Product Development'],
          isCurrent: true
        },
        {
          title: 'Senior Engineering Manager',
          company: 'TechCorp Inc.',
          companyId: 'techcorp-inc',
          location: 'San Francisco, CA',
          startDate: '2019-08-01',
          endDate: '2022-02-28',
          description: 'Managed 3 engineering teams (20+ engineers) working on core platform features. Improved delivery velocity by 40% and reduced technical debt.',
          skills: ['Engineering Management', 'Team Leadership', 'Agile Development'],
          isCurrent: false
        }
      ],
      education: [
        {
          institution: 'Stanford University',
          degree: 'Master of Science',
          field: 'Computer Science',
          startDate: '2008-09-01',
          endDate: '2010-06-01'
        },
        {
          institution: 'UC San Diego',
          degree: 'Bachelor of Science',
          field: 'Computer Engineering',
          startDate: '2004-09-01',
          endDate: '2008-06-01'
        }
      ],
      skills: [
        { name: 'Engineering Leadership', level: 'Expert', yearsOfExperience: 8, endorsements: 67 },
        { name: 'Team Scaling', level: 'Expert', yearsOfExperience: 6, endorsements: 45 },
        { name: 'Distributed Systems', level: 'Advanced', yearsOfExperience: 10, endorsements: 34 },
        { name: 'Product Strategy', level: 'Advanced', yearsOfExperience: 5, endorsements: 28 }
      ],
      projects: [],
      languages: ['English (Native)', 'Spanish (Native)'],
      interests: ['Engineering Leadership', 'Startups', 'Marathon Running'],
      openToWork: false,
      openToOpportunities: ['consulting', 'advisory'],
      preferredRoles: ['VP Engineering', 'CTO', 'Engineering Advisor']
    },
    role: 'business',
    visibility: 'public',
    status: 'active',
    companyId: 'growth-dynamics',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-30T10:00:00Z',
    lastActiveAt: '2024-01-30T08:45:00Z',
    profileViews: 445,
    connectionCount: 892,
    followerCount: 156,
    isVerified: true,
    isPremium: true
  },
  {
    id: MOCK_PEOPLE_IDS.ALEX_THOMPSON,
    data: {
      firstName: 'Alex',
      lastName: 'Thompson',
      avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&h=150&fit=crop&crop=face',
      headline: 'Data Scientist | ML Engineer | Python Expert',
      summary: 'Data scientist with 5+ years of experience building machine learning models and data pipelines. Expertise in Python, TensorFlow, and cloud platforms. Passionate about using data to solve real-world problems.',
      location: {
        city: 'Seattle',
        state: 'WA',
        country: 'USA',
        remote: true
      },
      contact: {
        email: 'alex.thompson@email.com',
        linkedin: 'https://linkedin.com/in/alexthompson-ds',
        github: 'https://github.com/alexthompson-ds'
      },
      experience: [
        {
          title: 'Senior Data Scientist',
          company: 'DataInsights Corp',
          location: 'Seattle, WA',
          startDate: '2021-09-01',
          description: 'Built predictive models for customer behavior analysis. Developed ML pipelines using Python, TensorFlow, and AWS.',
          skills: ['Python', 'TensorFlow', 'AWS', 'SQL'],
          isCurrent: true
        },
        {
          title: 'Data Scientist',
          company: 'Analytics Startup',
          location: 'San Francisco, CA',
          startDate: '2019-06-01',
          endDate: '2021-08-31',
          description: 'Developed recommendation systems and performed statistical analysis on large datasets.',
          skills: ['Python', 'Machine Learning', 'Statistics', 'SQL'],
          isCurrent: false
        }
      ],
      education: [
        {
          institution: 'University of Washington',
          degree: 'Master of Science',
          field: 'Data Science',
          startDate: '2017-09-01',
          endDate: '2019-06-01'
        }
      ],
      skills: [
        { name: 'Python', level: 'Expert', yearsOfExperience: 6, endorsements: 34 },
        { name: 'Machine Learning', level: 'Advanced', yearsOfExperience: 5, endorsements: 28 },
        { name: 'TensorFlow', level: 'Advanced', yearsOfExperience: 4, endorsements: 22 },
        { name: 'SQL', level: 'Advanced', yearsOfExperience: 5, endorsements: 19 }
      ],
      projects: [
        {
          name: 'Customer Churn Prediction',
          description: 'ML model to predict customer churn with 92% accuracy',
          technologies: ['Python', 'Scikit-learn', 'Pandas'],
          startDate: '2023-03-01',
          endDate: '2023-05-01',
          role: 'Data Scientist'
        }
      ],
      languages: ['English (Native)'],
      interests: ['AI/ML', 'Data Visualization', 'Basketball'],
      openToWork: true,
      openToOpportunities: ['full-time'],
      preferredRoles: ['Senior Data Scientist', 'ML Engineer', 'Data Science Manager']
    },
    role: 'job_seeker',
    visibility: 'public',
    status: 'looking',
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-01-29T15:30:00Z',
    lastActiveAt: '2024-01-30T07:20:00Z',
    profileViews: 89,
    connectionCount: 156,
    followerCount: 34,
    isVerified: false,
    isPremium: false
  },
  {
    id: MOCK_PEOPLE_IDS.MARIA_GARCIA,
    data: {
      firstName: 'Maria',
      lastName: 'Garcia',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop&crop=face',
      headline: 'UX Designer | Design Systems Expert | User Research Enthusiast',
      summary: 'UX designer with 7+ years of experience creating user-centered digital experiences. Specialized in design systems, user research, and mobile app design. Currently working on fintech products at InnovatePay.',
      location: {
        city: 'Los Angeles',
        state: 'CA',
        country: 'USA',
        remote: true
      },
      contact: {
        email: 'maria.garcia@innovatepay.com',
        linkedin: 'https://linkedin.com/in/mariagarcia-ux',
        website: 'https://mariagarcia.design'
      },
      experience: [
        {
          title: 'Senior UX Designer',
          company: 'InnovatePay',
          location: 'Los Angeles, CA',
          startDate: '2022-01-01',
          description: 'Lead UX design for mobile fintech application used by 500K+ users. Conducted user research and created design systems.',
          skills: ['UX Design', 'User Research', 'Figma', 'Design Systems'],
          isCurrent: true
        },
        {
          title: 'UX Designer',
          company: 'Creative Agency LLC',
          location: 'San Diego, CA',
          startDate: '2019-03-01',
          endDate: '2021-12-31',
          description: 'Designed user experiences for various client projects including e-commerce and SaaS applications.',
          skills: ['UX Design', 'Prototyping', 'User Testing'],
          isCurrent: false
        }
      ],
      education: [
        {
          institution: 'Art Center College of Design',
          degree: 'Bachelor of Fine Arts',
          field: 'Interaction Design',
          startDate: '2015-09-01',
          endDate: '2019-05-31'
        }
      ],
      skills: [
        { name: 'UX Design', level: 'Expert', yearsOfExperience: 7, endorsements: 56 },
        { name: 'User Research', level: 'Advanced', yearsOfExperience: 5, endorsements: 34 },
        { name: 'Figma', level: 'Expert', yearsOfExperience: 4, endorsements: 42 },
        { name: 'Design Systems', level: 'Advanced', yearsOfExperience: 3, endorsements: 28 }
      ],
      projects: [
        {
          name: 'Mobile Banking App Redesign',
          description: 'Complete UX redesign that increased user engagement by 35%',
          technologies: ['Figma', 'Principle', 'UserTesting'],
          startDate: '2022-06-01',
          endDate: '2022-12-01',
          role: 'Lead UX Designer'
        }
      ],
      languages: ['English (Native)', 'Spanish (Native)'],
      interests: ['Design', 'Photography', 'Travel'],
      openToWork: false,
      openToOpportunities: ['freelance'],
      preferredRoles: ['Senior UX Designer', 'Design Lead']
    },
    role: 'job_seeker',
    visibility: 'public',
    status: 'active',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-28T12:15:00Z',
    lastActiveAt: '2024-01-29T16:45:00Z',
    profileViews: 167,
    connectionCount: 234,
    followerCount: 67,
    isVerified: true,
    isPremium: true
  }
  // Additional users would be here...
];

export const MOCK_USER_METADATA: UserMetadata[] = MOCK_USERS.map(user => ({
  id: user.id,
  firstName: user.data.firstName,
  lastName: user.data.lastName,
  fullName: getUserFullName(user),
  avatar: user.data.avatar,
  headline: user.data.headline,
  location: user.data.location.remote 
    ? 'Remote' 
    : `${user.data.location.city}, ${user.data.location.state}`,
  role: user.role,
  visibility: user.visibility,
  status: user.status,
  companyId: user.companyId,
  companyName: user.companyId ? getCompanyNameById(user.companyId) : undefined,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastActiveAt: user.lastActiveAt,
  profileViews: user.profileViews,
  connectionCount: user.connectionCount,
  followerCount: user.followerCount,
  isVerified: user.isVerified,
  isPremium: user.isPremium,
  openToWork: user.data.openToWork,
  experienceLevel: getExperienceLevel(user),
  currentPosition: getCurrentPosition(user),
  currentCompany: user.data.experience.find(exp => exp.isCurrent)?.company
}));

// Helper function to get company name (would integrate with company data)
function getCompanyNameById(companyId: string): string | undefined {
  const companyMap: { [key: string]: string } = {
    'techcorp-inc': 'TechCorp Inc.',
    'growth-dynamics': 'Growth Dynamics',
    'cloudscale-solutions': 'CloudScale Solutions'
  };
  return companyMap[companyId];
}

// Tracked people for different users
export const TRACKED_PEOPLE: { [userId: string]: string[] } = {
  '1': [MOCK_PEOPLE_IDS.SARAH_RECRUITER, MOCK_PEOPLE_IDS.ALEX_THOMPSON], // John tracks these
  '2': [MOCK_PEOPLE_IDS.JOHN_SEEKER, MOCK_PEOPLE_IDS.MARIA_GARCIA], // Sarah tracks these
  '3': [MOCK_PEOPLE_IDS.JOHN_SEEKER, MOCK_PEOPLE_IDS.ALEX_THOMPSON], // Michael tracks these
  [MOCK_PEOPLE_IDS.ALEX_THOMPSON]: [MOCK_PEOPLE_IDS.JOHN_SEEKER, MOCK_PEOPLE_IDS.MICHAEL_BUSINESS],
  [MOCK_PEOPLE_IDS.MARIA_GARCIA]: [MOCK_PEOPLE_IDS.SARAH_RECRUITER, MOCK_PEOPLE_IDS.JOHN_SEEKER]
};

// Connections between users
export const MOCK_CONNECTIONS: Connection[] = [
  {
    id: 'conn-1',
    fromUserId: MOCK_PEOPLE_IDS.JOHN_SEEKER,
    toUserId: MOCK_PEOPLE_IDS.SARAH_RECRUITER,
    status: 'connected',
    message: 'Hi Sarah, I\'d love to connect and learn about opportunities at TechCorp!',
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T14:30:00Z',
    acceptedAt: '2024-01-10T14:30:00Z'
  },
  {
    id: 'conn-2',
    fromUserId: MOCK_PEOPLE_IDS.ALEX_THOMPSON,
    toUserId: MOCK_PEOPLE_IDS.JOHN_SEEKER,
    status: 'pending_sent',
    message: 'Hey John, saw your React work on GitHub. Would love to connect!',
    createdAt: '2024-01-25T09:15:00Z',
    updatedAt: '2024-01-25T09:15:00Z'
  },
  {
    id: 'conn-3',
    fromUserId: MOCK_PEOPLE_IDS.MARIA_GARCIA,
    toUserId: MOCK_PEOPLE_IDS.SARAH_RECRUITER,
    status: 'connected',
    createdAt: '2024-01-15T16:20:00Z',
    updatedAt: '2024-01-15T18:45:00Z',
    acceptedAt: '2024-01-15T18:45:00Z'
  }
];

// Helper functions
export const getUserById = (id: string): UserProfile | undefined => {
  return MOCK_USERS.find(user => user.id === id);
};

export const getUserMetadataById = (id: string): UserMetadata | undefined => {
  return MOCK_USER_METADATA.find(user => user.id === id);
};

export const getTrackedPeopleByUserId = (userId: string): UserProfile[] => {
  const trackedIds = TRACKED_PEOPLE[userId] || [];
  return MOCK_USERS.filter(user => trackedIds.includes(user.id));
};

export const getAllPeopleForUser = (userId: string): { tracked: UserProfile[] } => {
  const tracked = getTrackedPeopleByUserId(userId);
  return { tracked };
};

export const isPersonTrackedByUser = (personId: string, userId: string): boolean => {
  const trackedIds = TRACKED_PEOPLE[userId] || [];
  return trackedIds.includes(personId);
};

export const addTrackedPerson = (personId: string, userId: string): void => {
  if (!TRACKED_PEOPLE[userId]) {
    TRACKED_PEOPLE[userId] = [];
  }
  if (!TRACKED_PEOPLE[userId].includes(personId)) {
    TRACKED_PEOPLE[userId].push(personId);
  }
};

export const removeTrackedPerson = (personId: string, userId: string): void => {
  if (TRACKED_PEOPLE[userId]) {
    TRACKED_PEOPLE[userId] = TRACKED_PEOPLE[userId].filter(id => id !== personId);
  }
};

// Connection functions
export const getConnectionStatus = (fromUserId: string, toUserId: string): ConnectionStatus => {
  const connection = MOCK_CONNECTIONS.find(conn => 
    (conn.fromUserId === fromUserId && conn.toUserId === toUserId) ||
    (conn.fromUserId === toUserId && conn.toUserId === fromUserId)
  );
  
  if (!connection) return 'none';
  
  if (connection.status === 'connected') return 'connected';
  
  if (connection.fromUserId === fromUserId) {
    return connection.status === 'pending_sent' ? 'pending_sent' : connection.status;
  } else {
    return connection.status === 'pending_sent' ? 'pending_received' : connection.status;
  }
};

export const sendConnectionRequest = (fromUserId: string, toUserId: string, message?: string): Connection => {
  const newConnection: Connection = {
    id: `conn-${Date.now()}`,
    fromUserId,
    toUserId,
    status: 'pending_sent',
    message,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  MOCK_CONNECTIONS.push(newConnection);
  return newConnection;
};

export const acceptConnectionRequest = (connectionId: string): void => {
  const connection = MOCK_CONNECTIONS.find(conn => conn.id === connectionId);
  if (connection && connection.status === 'pending_sent') {
    connection.status = 'connected';
    connection.acceptedAt = new Date().toISOString();
    connection.updatedAt = new Date().toISOString();
  }
};

export const rejectConnectionRequest = (connectionId: string): void => {
  const index = MOCK_CONNECTIONS.findIndex(conn => conn.id === connectionId);
  if (index > -1) {
    MOCK_CONNECTIONS.splice(index, 1);
  }
};

export const getConnectionsByUserId = (userId: string): Connection[] => {
  return MOCK_CONNECTIONS.filter(conn => 
    conn.fromUserId === userId || conn.toUserId === userId
  );
};

export const getPendingConnectionRequests = (userId: string): Connection[] => {
  return MOCK_CONNECTIONS.filter(conn => 
    conn.toUserId === userId && conn.status === 'pending_sent'
  );
};

// Get public users for discovery
export const getPublicUsers = (): UserProfile[] => {
  return MOCK_USERS.filter(user => user.visibility === 'public');
};

// Get users by filters
export const getUsersByFilters = (filters: {
  role?: string[];
  location?: string;
  skills?: string[];
  openToWork?: boolean;
  search?: string;
  experience?: string;
}): UserProfile[] => {
  return MOCK_USERS.filter(user => {
    if (user.visibility !== 'public') return false;
    
    if (filters.role && filters.role.length > 0 && !filters.role.includes(user.role)) {
      return false;
    }
    
    if (filters.location && !user.data.location.city?.toLowerCase().includes(filters.location.toLowerCase())) {
      return false;
    }
    
    if (filters.skills && filters.skills.length > 0) {
      const userSkills = user.data.skills.map(skill => skill.name.toLowerCase());
      const hasSkill = filters.skills.some(skill => 
        userSkills.some(userSkill => userSkill.includes(skill.toLowerCase()))
      );
      if (!hasSkill) return false;
    }
    
    if (filters.openToWork !== undefined && user.data.openToWork !== filters.openToWork) {
      return false;
    }
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchText = `${user.data.firstName} ${user.data.lastName} ${user.data.headline} ${user.data.summary}`.toLowerCase();
      if (!searchText.includes(searchLower)) {
        return false;
      }
    }
    
    return true;
  });
};

export const generateUserId = (): string => {
  return 'u' + 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
