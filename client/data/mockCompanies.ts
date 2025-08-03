import { Company, CompanyMetadata, CompanyData, CompanyWithOwnership, OnboardingTask, DEFAULT_ONBOARDING_TASKS } from '@/types/company';

// Generate consistent UUIDs for mock company data
export const MOCK_COMPANY_IDS = {
  TECHCORP_INC: 'c1a2b3c4-d5e6-7890-abcd-ef1234567890',
  GROWTH_DYNAMICS: 'c2b3c4d5-e6f7-8901-bcde-f23456789012',
  CLOUDSCALE_SOLUTIONS: 'c3c4d5e6-f7g8-9012-cdef-345678901234',
  MOBILEFIRST_INC: 'c4d5e6f7-g8h9-0123-def0-456789012345',
  DATAINSIGHTS_CORP: 'c5e6f7g8-h9i0-1234-ef01-567890123456',
  WEBCRAFT_STUDIOS: 'c6f7g8h9-i0j1-2345-f012-678901234567',
  SALESTECH_PRO: 'c7g8h9i0-j1k2-3456-0123-789012345678',
  STARTUP_INNOVATE: 'c8h9i0j1-k2l3-4567-1234-890123456789',
} as const;

export const MOCK_COMPANIES: Company[] = [
  {
    id: MOCK_COMPANY_IDS.TECHCORP_INC,
    slug: 'techcorp-inc',
    data: {
      name: 'TechCorp Inc.',
      logo: 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=100&h=100&fit=crop',
      tagline: 'Building the future of enterprise software',
      description: 'TechCorp Inc. is a leading SaaS platform provider that helps enterprises streamline their operations and drive digital transformation. We\'re passionate about creating innovative solutions that solve real business problems and empower teams to achieve more.',
      industry: 'Technology',
      size: '200-500',
      founded: 2018,
      headquarters: {
        address: '123 Tech Street',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        postalCode: '94105',
        timezone: 'PST'
      },
      locations: [
        {
          city: 'San Francisco',
          state: 'CA',
          country: 'USA'
        },
        {
          city: 'Austin',
          state: 'TX',
          country: 'USA'
        }
      ],
      contact: {
        email: 'careers@techcorp.com',
        phone: '+1-555-123-4567',
        website: 'https://techcorp.com',
        linkedin: 'https://linkedin.com/company/techcorp',
        twitter: 'https://twitter.com/techcorp'
      },
      financials: {
        fundingStage: 'series-b',
        fundingAmount: 25000000,
        currency: 'USD',
        valuation: 150000000,
        profitability: 'break-even'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        visionInsurance: true,
        retirement401k: true,
        stockOptions: true,
        paidTimeOff: true,
        parentalLeave: true,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: true,
        gymMembership: true,
        freeFood: true,
        commuteBenefits: true,
        other: ['Pet-friendly office', 'Sabbatical program']
      },
      culture: [
        'Innovation-driven',
        'Collaborative',
        'Data-driven decisions',
        'Work-life balance',
        'Continuous learning'
      ],
      technologies: [
        'React',
        'Node.js',
        'TypeScript',
        'AWS',
        'Docker',
        'Kubernetes',
        'PostgreSQL',
        'GraphQL'
      ],
      perks: [
        'Unlimited PTO',
        'Remote-first culture',
        'Latest MacBook Pro',
        'Standing desks',
        'Free lunch',
        'Company retreats',
        'Learning stipend'
      ],
      mission: 'To empower businesses with intelligent software solutions that drive growth and efficiency.',
      vision: 'A world where every business can leverage technology to reach its full potential.',
      values: [
        'Customer obsession',
        'Innovation',
        'Integrity',
        'Collaboration',
        'Excellence'
      ]
    },
    status: 'active',
    visibility: 'public',
    onboardingTasks: DEFAULT_ONBOARDING_TASKS.map(task => ({
      ...task,
      completed: true
    })),
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-25T14:30:00Z',
    views: 2340,
    followers: 156,
    jobCount: 12,
    activeJobCount: 8,
    userId: '2', // Sarah Recruiter
    teamMembers: ['2', '3']
  },
  {
    id: MOCK_COMPANY_IDS.GROWTH_DYNAMICS,
    data: {
      name: 'Growth Dynamics',
      logo: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=100&h=100&fit=crop',
      tagline: 'Next-generation marketing automation',
      description: 'Growth Dynamics provides cutting-edge marketing automation solutions for modern businesses. Our platform helps companies scale their marketing efforts, improve customer engagement, and drive sustainable growth.',
      industry: 'Marketing Technology',
      size: '50-200',
      founded: 2020,
      headquarters: {
        city: 'Austin',
        state: 'TX',
        country: 'USA',
        postalCode: '78701',
        timezone: 'CST'
      },
      contact: {
        email: 'hello@growthdynamics.com',
        website: 'https://growthdynamics.com',
        linkedin: 'https://linkedin.com/company/growth-dynamics'
      },
      financials: {
        fundingStage: 'series-a',
        fundingAmount: 8000000,
        currency: 'USD',
        profitability: 'burning'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        visionInsurance: false,
        retirement401k: true,
        stockOptions: true,
        paidTimeOff: true,
        parentalLeave: true,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: true,
        gymMembership: false,
        freeFood: false,
        commuteBenefits: false,
        other: ['Mental health support', 'Flexible work arrangements']
      },
      culture: [
        'Fast-paced',
        'Results-oriented',
        'Startup mentality',
        'Customer-centric',
        'Growth mindset'
      ],
      technologies: [
        'Vue.js',
        'Python',
        'Django',
        'Redis',
        'Elasticsearch',
        'AWS',
        'Terraform'
      ],
      perks: [
        'Equity participation',
        'Remote work options',
        'Professional development',
        'Flexible hours'
      ],
      mission: 'To democratize advanced marketing technology for businesses of all sizes.',
      values: [
        'Growth',
        'Innovation',
        'Transparency',
        'Customer success'
      ]
    },
    status: 'active',
    visibility: 'public',
    onboardingTasks: DEFAULT_ONBOARDING_TASKS.map(task => ({
      ...task,
      completed: task.required
    })),
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-28T09:15:00Z',
    views: 1890,
    followers: 89,
    jobCount: 6,
    activeJobCount: 4,
    userId: '3', // Michael Business
    teamMembers: ['3']
  },
  {
    id: MOCK_COMPANY_IDS.CLOUDSCALE_SOLUTIONS,
    data: {
      name: 'CloudScale Solutions',
      logo: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=100&h=100&fit=crop',
      tagline: 'Scalable cloud infrastructure for modern applications',
      description: 'CloudScale Solutions specializes in cloud infrastructure and DevOps consulting. We help companies build, deploy, and scale applications in the cloud with confidence and efficiency.',
      industry: 'Cloud Infrastructure',
      size: '100-300',
      founded: 2019,
      headquarters: {
        city: 'Seattle',
        state: 'WA',
        country: 'USA',
        postalCode: '98101',
        timezone: 'PST'
      },
      contact: {
        email: 'careers@cloudscale.com',
        website: 'https://cloudscale.com'
      },
      financials: {
        fundingStage: 'series-a',
        fundingAmount: 12000000,
        currency: 'USD',
        profitability: 'profitable'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        visionInsurance: true,
        retirement401k: true,
        stockOptions: true,
        paidTimeOff: true,
        parentalLeave: true,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: true,
        gymMembership: true,
        freeFood: false,
        commuteBenefits: true,
        other: ['Home office stipend', 'Conference attendance']
      },
      culture: [
        'Technical excellence',
        'Remote-first',
        'Continuous learning',
        'Open communication',
        'Work-life balance'
      ],
      technologies: [
        'AWS',
        'Kubernetes',
        'Docker',
        'Terraform',
        'Go',
        'Python',
        'Jenkins',
        'Prometheus'
      ],
      perks: [
        'Remote-first culture',
        'Conference budget',
        'Latest tech equipment',
        'Certification reimbursement'
      ],
      mission: 'To simplify cloud adoption and help businesses scale with confidence.',
      values: [
        'Technical excellence',
        'Customer success',
        'Continuous improvement',
        'Collaboration'
      ]
    },
    status: 'active',
    visibility: 'public',
    onboardingTasks: DEFAULT_ONBOARDING_TASKS.map(task => ({
      ...task,
      completed: true
    })),
    createdAt: '2024-01-08T14:20:00Z',
    updatedAt: '2024-01-30T11:45:00Z',
    views: 1567,
    followers: 134,
    jobCount: 8,
    activeJobCount: 5,
    userId: '2', // Sarah Recruiter (multiple companies)
    teamMembers: ['2']
  },
  {
    id: MOCK_COMPANY_IDS.WEBCRAFT_STUDIOS,
    data: {
      name: 'WebCraft Studios',
      logo: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=100&h=100&fit=crop',
      tagline: 'Creative web development agency',
      description: 'WebCraft Studios is a boutique web development agency specializing in custom web applications, e-commerce solutions, and digital experiences. We work with startups and established businesses to bring their digital visions to life.',
      industry: 'Web Development',
      size: '10-50',
      founded: 2021,
      headquarters: {
        city: 'Portland',
        state: 'OR',
        country: 'USA',
        postalCode: '97201',
        timezone: 'PST'
      },
      contact: {
        email: 'hello@webcraft.com',
        website: 'https://webcraft.com'
      },
      financials: {
        fundingStage: 'pre-seed',
        profitability: 'profitable'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: false,
        visionInsurance: false,
        retirement401k: false,
        stockOptions: false,
        paidTimeOff: true,
        parentalLeave: false,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: true,
        gymMembership: false,
        freeFood: false,
        commuteBenefits: false,
        other: ['Creative project time']
      },
      culture: [
        'Creative',
        'Collaborative',
        'Client-focused',
        'Quality-driven',
        'Innovative'
      ],
      technologies: [
        'React',
        'Next.js',
        'TypeScript',
        'Tailwind CSS',
        'Node.js',
        'Prisma',
        'Vercel'
      ],
      perks: [
        'Flexible work arrangements',
        'Creative freedom',
        'Learning opportunities',
        'Small team culture'
      ],
      mission: 'To craft exceptional web experiences that drive business success.',
      values: [
        'Quality',
        'Creativity',
        'Partnership',
        'Growth'
      ]
    },
    status: 'onboarding',
    visibility: 'draft',
    onboardingTasks: DEFAULT_ONBOARDING_TASKS.map(task => ({
      ...task,
      completed: task.id === 'update_profile'
    })),
    createdAt: '2024-01-28T16:00:00Z',
    updatedAt: '2024-01-30T14:22:00Z',
    views: 45,
    followers: 8,
    jobCount: 2,
    activeJobCount: 1,
    userId: '1', // John Seeker (job_seeker with a company)
    teamMembers: ['1']
  },
  {
    id: MOCK_COMPANY_IDS.STARTUP_INNOVATE,
    data: {
      name: 'Startup Innovate',
      logo: 'https://images.unsplash.com/photo-1572021335469-31706a17aaef?w=100&h=100&fit=crop',
      tagline: 'Innovation accelerator for early-stage startups',
      description: 'Startup Innovate is a new innovation accelerator focused on helping early-stage technology startups scale their operations and reach product-market fit faster.',
      industry: 'Venture Capital',
      size: '1-10',
      founded: 2024,
      headquarters: {
        city: 'Miami',
        state: 'FL',
        country: 'USA',
        postalCode: '33101',
        timezone: 'EST'
      },
      contact: {
        email: 'contact@startupinnovate.com',
        website: 'https://startupinnovate.com'
      },
      financials: {
        fundingStage: 'pre-seed',
        profitability: 'burning'
      },
      benefits: {
        healthInsurance: false,
        dentalInsurance: false,
        visionInsurance: false,
        retirement401k: false,
        stockOptions: true,
        paidTimeOff: true,
        parentalLeave: false,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: false,
        gymMembership: false,
        freeFood: false,
        commuteBenefits: false,
        other: ['Equity in portfolio companies']
      },
      culture: [
        'Entrepreneurial',
        'Fast-moving',
        'High-energy',
        'Risk-taking',
        'Ambitious'
      ],
      technologies: [
        'Various (depends on portfolio companies)'
      ],
      perks: [
        'Equity opportunities',
        'Startup ecosystem access',
        'Mentorship opportunities',
        'Networking events'
      ],
      mission: 'To accelerate the next generation of transformative startups.',
      values: [
        'Innovation',
        'Speed',
        'Impact',
        'Collaboration'
      ]
    },
    status: 'draft',
    visibility: 'draft',
    onboardingTasks: DEFAULT_ONBOARDING_TASKS.map(task => ({
      ...task,
      completed: false
    })),
    createdAt: '2024-01-30T09:00:00Z',
    updatedAt: '2024-01-30T09:00:00Z',
    views: 12,
    followers: 2,
    jobCount: 0,
    activeJobCount: 0,
    userId: '4', // Another job seeker
    teamMembers: ['4']
  }
];

export const MOCK_COMPANY_METADATA: CompanyMetadata[] = MOCK_COMPANIES.map(company => {
  const completedTasks = company.onboardingTasks.filter(task => task.completed).length;
  const totalTasks = company.onboardingTasks.length;
  const onboardingProgress = Math.round((completedTasks / totalTasks) * 100);

  return {
    id: company.id,
    name: company.data.name,
    logo: company.data.logo,
    tagline: company.data.tagline,
    industry: company.data.industry,
    size: company.data.size,
    location: `${company.data.headquarters.city}, ${company.data.headquarters.state}`,
    status: company.status,
    visibility: company.visibility,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    views: company.views,
    followers: company.followers,
    jobCount: company.jobCount,
    activeJobCount: company.activeJobCount,
    userId: company.userId,
    teamMembers: company.teamMembers,
    onboardingProgress
  };
});

// Tracked companies for different users
export const TRACKED_COMPANIES: { [userId: string]: string[] } = {
  '1': [MOCK_COMPANY_IDS.TECHCORP_INC, MOCK_COMPANY_IDS.GROWTH_DYNAMICS], // John Seeker tracks these
  '2': [MOCK_COMPANY_IDS.GROWTH_DYNAMICS], // Sarah Recruiter tracks others (in addition to her own)
  '3': [MOCK_COMPANY_IDS.TECHCORP_INC, MOCK_COMPANY_IDS.CLOUDSCALE_SOLUTIONS], // Michael Business tracks these
  '4': [MOCK_COMPANY_IDS.TECHCORP_INC, MOCK_COMPANY_IDS.WEBCRAFT_STUDIOS], // Another job seeker
  '5': [MOCK_COMPANY_IDS.GROWTH_DYNAMICS, MOCK_COMPANY_IDS.CLOUDSCALE_SOLUTIONS] // Another job seeker
};

// Helper functions
export const getCompanyById = (id: string): Company | undefined => {
  return MOCK_COMPANIES.find(company => company.id === id);
};

export const getCompanyMetadataById = (id: string): CompanyMetadata | undefined => {
  return MOCK_COMPANY_METADATA.find(company => company.id === id);
};

export const getCompaniesByUserId = (userId: string): Company[] => {
  return MOCK_COMPANIES.filter(company => 
    company.userId === userId || company.teamMembers?.includes(userId)
  );
};

export const getTrackedCompaniesByUserId = (userId: string): Company[] => {
  const trackedIds = TRACKED_COMPANIES[userId] || [];
  return MOCK_COMPANIES.filter(company => trackedIds.includes(company.id));
};

export const getAllCompaniesForUser = (userId: string): { owned: Company[], tracked: Company[] } => {
  const owned = getCompaniesByUserId(userId);
  const tracked = getTrackedCompaniesByUserId(userId);
  return { owned, tracked };
};

export const isCompanyTrackedByUser = (companyId: string, userId: string): boolean => {
  const trackedIds = TRACKED_COMPANIES[userId] || [];
  return trackedIds.includes(companyId);
};

export const addTrackedCompany = (companyId: string, userId: string): void => {
  if (!TRACKED_COMPANIES[userId]) {
    TRACKED_COMPANIES[userId] = [];
  }
  if (!TRACKED_COMPANIES[userId].includes(companyId)) {
    TRACKED_COMPANIES[userId].push(companyId);
  }
};

export const removeTrackedCompany = (companyId: string, userId: string): void => {
  if (TRACKED_COMPANIES[userId]) {
    TRACKED_COMPANIES[userId] = TRACKED_COMPANIES[userId].filter(id => id !== companyId);
  }
};

export const generateCompanyId = (): string => {
  return 'c' + 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Get public companies for discovery
export const getPublicCompanies = (): Company[] => {
  return MOCK_COMPANIES.filter(company => company.visibility === 'public' && company.status === 'active');
};

// Get companies by filters
export const getCompaniesByFilters = (filters: {
  industry?: string[];
  size?: string[];
  location?: string;
  search?: string;
  status?: string;
}): Company[] => {
  return MOCK_COMPANIES.filter(company => {
    if (company.visibility !== 'public' || company.status !== 'active') return false;
    
    if (filters.industry && filters.industry.length > 0 && !filters.industry.includes(company.data.industry)) {
      return false;
    }
    
    if (filters.size && filters.size.length > 0 && !filters.size.includes(company.data.size)) {
      return false;
    }
    
    if (filters.location && !company.data.headquarters.city?.toLowerCase().includes(filters.location.toLowerCase())) {
      return false;
    }
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchText = `${company.data.name} ${company.data.description} ${company.data.industry}`.toLowerCase();
      if (!searchText.includes(searchLower)) {
        return false;
      }
    }
    
    return true;
  });
};

// Update company onboarding task
export const updateOnboardingTask = (companyId: string, taskId: string, completed: boolean): void => {
  const company = MOCK_COMPANIES.find(c => c.id === companyId);
  if (company) {
    const task = company.onboardingTasks.find(t => t.id === taskId);
    if (task) {
      task.completed = completed;
      company.updatedAt = new Date().toISOString();
      
      // Update status based on required tasks completion
      const requiredTasks = company.onboardingTasks.filter(t => t.required);
      const completedRequiredTasks = requiredTasks.filter(t => t.completed);
      
      if (completedRequiredTasks.length === requiredTasks.length && company.status === 'onboarding') {
        company.status = 'active';
        company.visibility = 'public';
      }
    }
  }
};

// Auto-track company when user tracks a job from that company
export const autoTrackCompanyFromJob = (jobCompanyName: string, userId: string): void => {
  // Find company by name (case-insensitive)
  const company = MOCK_COMPANIES.find(c =>
    c.data.name.toLowerCase() === jobCompanyName.toLowerCase()
  );

  if (company && !isCompanyTrackedByUser(company.id, userId)) {
    addTrackedCompany(company.id, userId);
  }
};

// Helper function to track company when job is tracked
export const trackCompanyFromJobData = (jobCompanyName: string, userId: string): void => {
  autoTrackCompanyFromJob(jobCompanyName, userId);
};

// Get companies that should be auto-tracked based on tracked jobs
export const getCompaniesFromTrackedJobs = (userId: string): Company[] => {
  // This would integrate with the job tracking system
  // For now, it's automatically handled in the addTrackedJob function
  const trackedCompanies = getTrackedCompaniesByUserId(userId);
  return trackedCompanies.filter(company =>
    // Filter companies that were auto-tracked from jobs
    company.status === 'active' && company.visibility === 'public'
  );
};
