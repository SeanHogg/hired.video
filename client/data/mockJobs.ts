import { Job, JobMetadata, JobData } from '@/types/job';

// Generate consistent UUIDs for mock job data
export const MOCK_JOB_IDS = {
  SENIOR_SOFTWARE_ENGINEER: 'j1a2b3c4-d5e6-7890-abcd-ef1234567890',
  PRODUCT_MARKETING_MANAGER: 'j2b3c4d5-e6f7-8901-bcde-f23456789012',
  DEVOPS_ENGINEER: 'j3c4d5e6-f7g8-9012-cdef-345678901234',
  UX_DESIGNER: 'j4d5e6f7-g8h9-0123-def0-456789012345',
  DATA_SCIENTIST: 'j5e6f7g8-h9i0-1234-ef01-567890123456',
  FRONTEND_DEVELOPER: 'j6f7g8h9-i0j1-2345-f012-678901234567',
  SALES_MANAGER: 'j7g8h9i0-j1k2-3456-0123-789012345678',
  CONTENT_WRITER: 'j8h9i0j1-k2l3-4567-1234-890123456789',
} as const;

export const MOCK_JOBS: Job[] = [
  {
    id: MOCK_JOB_IDS.SENIOR_SOFTWARE_ENGINEER,
    slug: 'senior-software-engineer-remote',
    data: {
      title: 'Senior Software Engineer',
      department: 'Engineering',
      description: 'Join our innovative engineering team to build next-generation web applications that serve millions of users worldwide. You\'ll work with cutting-edge technologies including React, Node.js, and cloud platforms to create scalable, high-performance solutions.',
      summary: 'Build scalable web applications with React, Node.js, and cloud technologies',
      responsibilities: [
        'Design and develop high-quality, scalable web applications',
        'Collaborate with product managers and designers to deliver features',
        'Mentor junior developers and conduct code reviews',
        'Participate in architectural decisions and technical planning',
        'Optimize application performance and ensure high availability'
      ],
      requirements: [
        { skill: 'React', level: 'Advanced', required: true },
        { skill: 'Node.js', level: 'Advanced', required: true },
        { skill: 'TypeScript', level: 'Intermediate', required: true },
        { skill: 'AWS', level: 'Intermediate', required: false },
        { skill: 'Docker', level: 'Intermediate', required: false }
      ],
      qualifications: [
        '5+ years of software development experience',
        'Strong experience with React and modern JavaScript',
        'Experience with backend development using Node.js',
        'Knowledge of database design and SQL',
        'Experience with version control (Git) and CI/CD'
      ],
      benefits: [
        { type: 'Health Insurance', description: 'Comprehensive medical, dental, and vision coverage' },
        { type: 'Stock Options', description: 'Equity participation in company growth' },
        { type: 'PTO', description: 'Unlimited paid time off policy' },
        { type: 'Professional Development', description: '$3,000 annual learning budget' }
      ],
      salaryMin: 120000,
      salaryMax: 180000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'senior',
      education: 'Bachelor\'s degree in Computer Science or equivalent experience',
      location: {
        address: '123 Tech Street',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        remote: true,
        hybrid: true
      },
      company: {
        name: 'TechCorp Inc.',
        logo: 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=100&h=100&fit=crop',
        website: 'https://techcorp.com',
        size: '200-500',
        industry: 'Technology',
        description: 'Leading SaaS platform for enterprise productivity solutions'
      },
      videoUrl: 'https://example.com/job-video-1',
      applicationUrl: 'https://techcorp.com/careers/apply',
      contactEmail: 'hiring@techcorp.com',
      applicationDeadline: '2024-03-15'
    },
    status: 'active',
    privacy: 'public',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T14:30:00Z',
    expiresAt: '2024-03-15T23:59:59Z',
    views: 245,
    applications: 23,
    userId: '2', // Sarah Recruiter
    companyId: 'tech-corp-inc'
  },
  {
    id: MOCK_JOB_IDS.PRODUCT_MARKETING_MANAGER,
    slug: 'product-marketing-manager-growth',
    data: {
      title: 'Product Marketing Manager',
      department: 'Marketing',
      description: 'Drive go-to-market strategy for our flagship SaaS platform. Lead product launches, develop compelling marketing campaigns, and work closely with product and sales teams to accelerate growth.',
      summary: 'Lead go-to-market strategy and product launches for SaaS platform',
      responsibilities: [
        'Develop and execute comprehensive go-to-market strategies',
        'Create compelling product messaging and positioning',
        'Lead cross-functional product launch initiatives',
        'Conduct market research and competitive analysis',
        'Collaborate with sales team to enable effective selling'
      ],
      requirements: [
        { skill: 'Product Marketing', level: 'Advanced', required: true },
        { skill: 'SaaS', level: 'Advanced', required: true },
        { skill: 'Analytics', level: 'Intermediate', required: true },
        { skill: 'Content Creation', level: 'Advanced', required: false },
        { skill: 'Public Speaking', level: 'Intermediate', required: false }
      ],
      qualifications: [
        '4+ years of product marketing experience',
        'Proven track record in B2B SaaS marketing',
        'Experience with product launches and messaging',
        'Strong analytical and data-driven approach',
        'Excellent written and verbal communication skills'
      ],
      benefits: [
        { type: 'Health Insurance', description: 'Full health, dental, and vision coverage' },
        { type: 'Equity', description: 'Stock options with high growth potential' },
        { type: 'Flexible Work', description: 'Remote-first culture with flexible hours' },
        { type: 'Professional Development', description: 'Conference attendance and training budget' }
      ],
      salaryMin: 90000,
      salaryMax: 130000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'mid',
      education: 'MBA or Bachelor\'s in Marketing, Business, or related field',
      location: {
        city: 'Remote',
        country: 'USA',
        remote: true,
        hybrid: false
      },
      company: {
        name: 'Growth Dynamics',
        logo: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=100&h=100&fit=crop',
        website: 'https://growthdynamics.com',
        size: '50-200',
        industry: 'Marketing Technology',
        description: 'Next-generation marketing automation platform'
      },
      videoUrl: 'https://example.com/job-video-2',
      applicationUrl: 'https://growthdynamics.com/careers',
      contactEmail: 'careers@growthdynamics.com',
      applicationDeadline: '2024-02-28'
    },
    status: 'active',
    privacy: 'public',
    createdAt: '2024-01-18T09:15:00Z',
    updatedAt: '2024-01-22T16:45:00Z',
    expiresAt: '2024-02-28T23:59:59Z',
    views: 189,
    applications: 15,
    userId: '3', // Michael Business
    companyId: 'growth-dynamics'
  },
  {
    id: MOCK_JOB_IDS.DEVOPS_ENGINEER,
    slug: 'devops-engineer-kubernetes',
    data: {
      title: 'DevOps Engineer',
      department: 'Infrastructure',
      description: 'Join our platform team to build and maintain cloud infrastructure that powers our global SaaS platform. Work with Kubernetes, AWS, and modern DevOps tools to ensure scalability and reliability.',
      summary: 'Build and maintain cloud infrastructure with Kubernetes and AWS',
      responsibilities: [
        'Design and manage cloud infrastructure on AWS',
        'Implement and maintain CI/CD pipelines',
        'Monitor system performance and reliability',
        'Automate deployment and scaling processes',
        'Collaborate with development teams on infrastructure needs'
      ],
      requirements: [
        { skill: 'AWS', level: 'Advanced', required: true },
        { skill: 'Kubernetes', level: 'Advanced', required: true },
        { skill: 'Docker', level: 'Advanced', required: true },
        { skill: 'Terraform', level: 'Intermediate', required: false },
        { skill: 'Python', level: 'Intermediate', required: false }
      ],
      qualifications: [
        '3+ years of DevOps or infrastructure experience',
        'Strong experience with AWS cloud services',
        'Proficiency with containerization and orchestration',
        'Experience with Infrastructure as Code',
        'Knowledge of monitoring and logging tools'
      ],
      benefits: [
        { type: 'Health Insurance', description: 'Premium health coverage for you and family' },
        { type: 'Stock Options', description: 'Early-stage equity opportunity' },
        { type: 'Learning Budget', description: '$4,000 annual certification and training budget' },
        { type: 'Home Office', description: '$2,000 home office setup stipend' }
      ],
      salaryMin: 110000,
      salaryMax: 160000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'mid',
      education: 'Bachelor\'s in Computer Science, Engineering, or equivalent experience',
      location: {
        address: '456 Cloud Avenue',
        city: 'Austin',
        state: 'TX',
        country: 'USA',
        remote: true,
        hybrid: true
      },
      company: {
        name: 'CloudScale Solutions',
        logo: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=100&h=100&fit=crop',
        website: 'https://cloudscale.com',
        size: '100-300',
        industry: 'Cloud Infrastructure',
        description: 'Scalable cloud solutions for modern applications'
      },
      videoUrl: 'https://example.com/job-video-3',
      applicationUrl: 'https://cloudscale.com/careers',
      contactEmail: 'jobs@cloudscale.com'
    },
    status: 'active',
    privacy: 'recruiter_only',
    createdAt: '2024-01-20T11:30:00Z',
    updatedAt: '2024-01-25T15:20:00Z',
    views: 156,
    applications: 18,
    userId: '2', // Sarah Recruiter
    companyId: 'cloudscale-solutions'
  },
  {
    id: MOCK_JOB_IDS.UX_DESIGNER,
    slug: 'ux-designer-saas-platform',
    data: {
      title: 'Senior UX Designer',
      department: 'Design',
      description: 'Lead user experience design for our consumer mobile app used by millions. Create intuitive, beautiful interfaces that delight users and drive engagement.',
      summary: 'Design user experiences for consumer mobile app with millions of users',
      responsibilities: [
        'Lead UX design for mobile app features and improvements',
        'Conduct user research and usability testing',
        'Create wireframes, prototypes, and design specifications',
        'Collaborate with product managers and engineers',
        'Maintain and evolve design system'
      ],
      requirements: [
        { skill: 'UX Design', level: 'Expert', required: true },
        { skill: 'Figma', level: 'Advanced', required: true },
        { skill: 'User Research', level: 'Advanced', required: true },
        { skill: 'Prototyping', level: 'Advanced', required: false },
        { skill: 'Mobile Design', level: 'Advanced', required: true }
      ],
      qualifications: [
        '5+ years of UX design experience',
        'Strong portfolio showcasing mobile app design',
        'Experience with user research methodologies',
        'Proficiency in design tools (Figma, Sketch, etc.)',
        'Understanding of front-end development principles'
      ],
      benefits: [
        { type: 'Health Insurance', description: 'Comprehensive health and wellness coverage' },
        { type: 'Creative Budget', description: '$1,500 annual creative tools and inspiration budget' },
        { type: 'Flexible Schedule', description: 'Core hours with flexible start/end times' },
        { type: 'Equity', description: 'Stock options in high-growth company' }
      ],
      salaryMin: 95000,
      salaryMax: 140000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'senior',
      education: 'Bachelor\'s in Design, HCI, or related field',
      location: {
        address: '789 Design District',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        remote: false,
        hybrid: true
      },
      company: {
        name: 'MobileFirst Inc.',
        logo: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=100&h=100&fit=crop',
        website: 'https://mobilefirst.com',
        size: '500-1000',
        industry: 'Mobile Technology',
        description: 'Leading mobile-first consumer applications'
      },
      applicationUrl: 'https://mobilefirst.com/jobs',
      contactEmail: 'design-jobs@mobilefirst.com',
      applicationDeadline: '2024-03-01'
    },
    status: 'active',
    privacy: 'public',
    createdAt: '2024-01-22T14:00:00Z',
    updatedAt: '2024-01-28T10:15:00Z',
    views: 203,
    applications: 31,
    userId: '3', // Michael Business
    companyId: 'mobilefirst-inc'
  },
  {
    id: MOCK_JOB_IDS.DATA_SCIENTIST,
    slug: 'data-scientist-ml-remote',
    data: {
      title: 'Data Scientist',
      department: 'Analytics',
      description: 'Drive data-driven decision making across the organization. Build predictive models, analyze user behavior, and generate insights that shape product strategy.',
      summary: 'Build predictive models and generate insights from user data',
      responsibilities: [
        'Develop machine learning models for user behavior prediction',
        'Analyze large datasets to identify trends and opportunities',
        'Create dashboards and reports for stakeholders',
        'Collaborate with product teams on A/B testing',
        'Build data pipelines and maintain data quality'
      ],
      requirements: [
        { skill: 'Python', level: 'Advanced', required: true },
        { skill: 'Machine Learning', level: 'Advanced', required: true },
        { skill: 'SQL', level: 'Advanced', required: true },
        { skill: 'Statistics', level: 'Advanced', required: true },
        { skill: 'Pandas', level: 'Advanced', required: false }
      ],
      qualifications: [
        '3+ years of data science experience',
        'Advanced degree in Statistics, Mathematics, or related field',
        'Strong programming skills in Python or R',
        'Experience with machine learning frameworks',
        'Knowledge of statistical analysis and modeling'
      ],
      benefits: [
        { type: 'Health Insurance', description: 'Full medical, dental, and vision coverage' },
        { type: 'Research Time', description: '20% time for personal research projects' },
        { type: 'Conference Budget', description: 'Annual budget for conferences and learning' },
        { type: 'Stock Options', description: 'Equity in data-driven company' }
      ],
      salaryMin: 130000,
      salaryMax: 190000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'mid',
      education: 'Master\'s or PhD in Statistics, Computer Science, or related quantitative field',
      location: {
        address: '321 Data Drive',
        city: 'Seattle',
        state: 'WA',
        country: 'USA',
        remote: true,
        hybrid: true
      },
      company: {
        name: 'DataInsights Corp',
        logo: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=100&h=100&fit=crop',
        website: 'https://datainsights.com',
        size: '200-500',
        industry: 'Data Analytics',
        description: 'Advanced analytics and machine learning solutions'
      },
      videoUrl: 'https://example.com/job-video-4',
      applicationUrl: 'https://datainsights.com/careers',
      contactEmail: 'hiring@datainsights.com'
    },
    status: 'active',
    privacy: 'public',
    createdAt: '2024-01-25T08:45:00Z',
    updatedAt: '2024-01-25T08:45:00Z',
    views: 178,
    applications: 12,
    userId: '2', // Sarah Recruiter
    companyId: 'datainsights-corp'
  },
  {
    id: MOCK_JOB_IDS.FRONTEND_DEVELOPER,
    slug: 'frontend-developer-react-typescript',
    data: {
      title: 'Frontend Developer',
      department: 'Engineering',
      description: 'Build beautiful, responsive user interfaces for our web applications. Work with modern frameworks and tools to create exceptional user experiences.',
      summary: 'Create responsive web interfaces with modern JavaScript frameworks',
      responsibilities: [
        'Develop responsive web applications using React',
        'Implement pixel-perfect designs from Figma',
        'Optimize applications for performance and accessibility',
        'Collaborate with designers and backend developers',
        'Write clean, maintainable, and testable code'
      ],
      requirements: [
        { skill: 'React', level: 'Advanced', required: true },
        { skill: 'JavaScript', level: 'Advanced', required: true },
        { skill: 'CSS', level: 'Advanced', required: true },
        { skill: 'TypeScript', level: 'Intermediate', required: false },
        { skill: 'Tailwind CSS', level: 'Intermediate', required: false }
      ],
      qualifications: [
        '2+ years of frontend development experience',
        'Strong proficiency in React and modern JavaScript',
        'Experience with responsive design and CSS frameworks',
        'Knowledge of version control (Git)',
        'Understanding of web performance optimization'
      ],
      benefits: [
        { type: 'Health Insurance', description: 'Health and dental coverage' },
        { type: 'Professional Development', description: 'Learning stipend and conference attendance' },
        { type: 'Flexible Hours', description: 'Flexible working hours and remote options' },
        { type: 'Equipment', description: 'Latest MacBook and development tools' }
      ],
      salaryMin: 75000,
      salaryMax: 110000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'mid',
      education: 'Bachelor\'s degree or equivalent experience',
      location: {
        address: '654 Frontend Lane',
        city: 'Portland',
        state: 'OR',
        country: 'USA',
        remote: true,
        hybrid: false
      },
      company: {
        name: 'WebCraft Studios',
        logo: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=100&h=100&fit=crop',
        website: 'https://webcraft.com',
        size: '10-50',
        industry: 'Web Development',
        description: 'Creative web development agency'
      },
      applicationUrl: 'https://webcraft.com/careers',
      contactEmail: 'jobs@webcraft.com',
      applicationDeadline: '2024-02-20'
    },
    status: 'active',
    privacy: 'public',
    createdAt: '2024-01-28T12:00:00Z',
    updatedAt: '2024-01-28T12:00:00Z',
    views: 92,
    applications: 8,
    userId: '1', // John Seeker (job_seeker posting a job - could be freelance)
    companyId: 'webcraft-studios'
  },
  {
    id: MOCK_JOB_IDS.SALES_MANAGER,
    slug: 'sales-manager-enterprise-saas',
    data: {
      title: 'Regional Sales Manager',
      department: 'Sales',
      description: 'Lead our West Coast sales team to drive revenue growth. Manage enterprise accounts and develop new business opportunities in the B2B SaaS space.',
      summary: 'Manage enterprise sales team and drive B2B SaaS revenue growth',
      responsibilities: [
        'Lead and mentor a team of 5-8 sales representatives',
        'Develop and execute regional sales strategies',
        'Manage key enterprise accounts and relationships',
        'Identify and pursue new business opportunities',
        'Collaborate with marketing on lead generation campaigns'
      ],
      requirements: [
        { skill: 'B2B Sales', level: 'Expert', required: true },
        { skill: 'Team Management', level: 'Advanced', required: true },
        { skill: 'SaaS', level: 'Advanced', required: true },
        { skill: 'CRM', level: 'Advanced', required: true },
        { skill: 'Negotiation', level: 'Advanced', required: false }
      ],
      qualifications: [
        '5+ years of B2B sales experience',
        '2+ years of sales management experience',
        'Proven track record in SaaS sales',
        'Experience with enterprise accounts',
        'Strong communication and leadership skills'
      ],
      benefits: [
        { type: 'Commission', description: 'Uncapped commission with accelerators' },
        { type: 'Health Insurance', description: 'Premium health coverage' },
        { type: 'Car Allowance', description: 'Monthly car allowance for travel' },
        { type: 'Stock Options', description: 'Equity participation' }
      ],
      salaryMin: 120000,
      salaryMax: 180000,
      currency: 'USD',
      employmentType: 'full-time',
      experienceLevel: 'senior',
      education: 'Bachelor\'s degree in Business or related field',
      location: {
        address: '987 Sales Plaza',
        city: 'Los Angeles',
        state: 'CA',
        country: 'USA',
        remote: false,
        hybrid: true
      },
      company: {
        name: 'SalesTech Pro',
        logo: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=100&h=100&fit=crop',
        website: 'https://salestech.pro',
        size: '100-300',
        industry: 'Sales Technology',
        description: 'Advanced sales automation and CRM solutions'
      },
      applicationUrl: 'https://salestech.pro/careers',
      contactEmail: 'careers@salestech.pro'
    },
    status: 'draft',
    privacy: 'private',
    createdAt: '2024-01-30T16:20:00Z',
    updatedAt: '2024-01-30T16:20:00Z',
    views: 0,
    applications: 0,
    userId: '3', // Michael Business
    companyId: 'salestech-pro'
  }
];

export const MOCK_JOB_METADATA: JobMetadata[] = MOCK_JOBS.map(job => ({
  id: job.id,
  slug: job.slug,
  title: job.data.title,
  company: job.data.company.name,
  location: job.data.location.remote 
    ? 'Remote' 
    : `${job.data.location.city}, ${job.data.location.state}`,
  salary: job.data.salaryMin && job.data.salaryMax 
    ? `$${(job.data.salaryMin / 1000).toFixed(0)}k - $${(job.data.salaryMax / 1000).toFixed(0)}k`
    : undefined,
  employmentType: job.data.employmentType,
  experienceLevel: job.data.experienceLevel,
  status: job.status,
  privacy: job.privacy,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  expiresAt: job.expiresAt,
  views: job.views,
  applications: job.applications,
  summary: job.data.summary,
  userId: job.userId,
  companyId: job.companyId
}));

// Helper functions
export const getJobById = (id: string): Job | undefined => {
  return MOCK_JOBS.find(job => job.id === id);
};

export const getJobBySlug = (slug: string): Job | undefined => {
  return MOCK_JOBS.find(job => job.slug === slug);
};

export const getJobMetadataById = (id: string): JobMetadata | undefined => {
  return MOCK_JOB_METADATA.find(job => job.id === id);
};

export const getJobsByUserId = (userId: string): Job[] => {
  return MOCK_JOBS.filter(job => job.userId === userId);
};

// Tracked jobs for recruiters, business users, and job seekers
export const TRACKED_JOBS: { [userId: string]: string[] } = {
  '1': [MOCK_JOB_IDS.SENIOR_SOFTWARE_ENGINEER, MOCK_JOB_IDS.DEVOPS_ENGINEER], // John Seeker tracks these
  '2': [MOCK_JOB_IDS.UX_DESIGNER, MOCK_JOB_IDS.DATA_SCIENTIST], // Sarah Recruiter tracks these (in addition to her own)
  '3': [MOCK_JOB_IDS.FRONTEND_DEVELOPER], // Michael Business tracks this
  '4': [MOCK_JOB_IDS.PRODUCT_MARKETING_MANAGER, MOCK_JOB_IDS.SENIOR_SOFTWARE_ENGINEER], // Another job seeker
  '5': [MOCK_JOB_IDS.UX_DESIGNER, MOCK_JOB_IDS.FRONTEND_DEVELOPER] // Another job seeker
};

export const getTrackedJobsByUserId = (userId: string): Job[] => {
  const trackedIds = TRACKED_JOBS[userId] || [];
  return MOCK_JOBS.filter(job => trackedIds.includes(job.id));
};

export const getAllJobsForUser = (userId: string): { owned: Job[], tracked: Job[] } => {
  const owned = getJobsByUserId(userId);
  const tracked = getTrackedJobsByUserId(userId);
  return { owned, tracked };
};

export const isJobTrackedByUser = (jobId: string, userId: string): boolean => {
  const trackedIds = TRACKED_JOBS[userId] || [];
  return trackedIds.includes(jobId);
};

export const addTrackedJob = (jobId: string, userId: string): void => {
  if (!TRACKED_JOBS[userId]) {
    TRACKED_JOBS[userId] = [];
  }
  if (!TRACKED_JOBS[userId].includes(jobId)) {
    TRACKED_JOBS[userId].push(jobId);

    // Auto-track the company when tracking a job
    const job = getJobById(jobId);
    if (job && job.data.company.name) {
      // Import and use company tracking functions
      import('./mockCompanies').then(({ trackCompanyFromJobData }) => {
        trackCompanyFromJobData(job.data.company.name, userId);
      });
    }
  }
};

export const removeTrackedJob = (jobId: string, userId: string): void => {
  if (TRACKED_JOBS[userId]) {
    TRACKED_JOBS[userId] = TRACKED_JOBS[userId].filter(id => id !== jobId);
  }
};

export const generateJobId = (): string => {
  return 'j' + 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Get public jobs for marketing pages
export const getPublicJobs = (): Job[] => {
  return MOCK_JOBS.filter(job => job.privacy === 'public' && job.status === 'active');
};

// Get jobs by filters
export const getJobsByFilters = (filters: {
  location?: string;
  remote?: boolean;
  employmentType?: string;
  experienceLevel?: string;
  search?: string;
}): Job[] => {
  return MOCK_JOBS.filter(job => {
    if (job.status !== 'active' || job.privacy !== 'public') return false;
    
    if (filters.location && !job.data.location.city?.toLowerCase().includes(filters.location.toLowerCase())) {
      return false;
    }
    
    if (filters.remote !== undefined && job.data.location.remote !== filters.remote) {
      return false;
    }
    
    if (filters.employmentType && job.data.employmentType !== filters.employmentType) {
      return false;
    }
    
    if (filters.experienceLevel && job.data.experienceLevel !== filters.experienceLevel) {
      return false;
    }
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchText = `${job.data.title} ${job.data.company.name} ${job.data.description}`.toLowerCase();
      if (!searchText.includes(searchLower)) {
        return false;
      }
    }
    
    return true;
  });
};
