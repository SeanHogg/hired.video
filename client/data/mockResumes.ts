import { Resume, ResumeMetadata, ResumeData } from '@/types/resume';

// Generate consistent UUIDs for mock data
export const MOCK_RESUME_IDS = {
  SEAN_HOGG_MASTER: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  FRONTEND_SPECIALIST: 'b2c3d4e5-f6g7-8901-bcde-f23456789012',
  DEVOPS_ENGINEER: 'c3d4e5f6-g7h8-9012-cdef-345678901234',
  SARAH_CHEN_RESUME: 'd4e5f6g7-h8i9-0123-def0-456789012345',
  MICHAEL_RODRIGUEZ: 'e5f6g7h8-i9j0-1234-ef01-567890123456',
  JENNIFER_MARTINEZ_PRIVATE: 'f6g7h8i9-j0k1-2345-f012-678901234567',
} as const;

export const SEAN_HOGG_RESUME_DATA: ResumeData = {
  "Basics": {
    "Name": "Sean Hogg",
    "Label": "CTO and Technology Leader",
    "Image": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    "Email": "seanhogg@gmail.com",
    "Phone": "2488250176",
    "Url": "https://seanhogg.dev",
    "Summary": "CTO and Technology Leader with 25 years of experience driving business value through innovative technology solutions with amazing teams. Expert in aligning technical goals with business objectives, optimizing scalable cloud-native solutions, and fostering a collaborative team environment. Passionate about culture, customer experience, and delivering robust, distributed systems across multiple industries, while championing strategic initiatives and advanced AI & Machine Learning solutions.",
    "Location": {
      "Address": "123 Tech Street",
      "PostalCode": "48304",
      "City": "Detroit",
      "CountryCode": "US",
      "Region": "Michigan"
    }
  },
  "Work": [
    {
      "Name": "HireFractionalTalent.com",
      "Position": "Consulting Fractional VP of Technology/CTO",
      "Summary": "Leading technology strategy and implementation for multiple clients in FinTech, Health, and Retail sectors.",
      "StartDate": "2022-10-01",
      "EndDate": "Present",
      "Highlights": [
        "Mentor startups and SMBs in FinTech, Health, Retail, Agriculture, and Energy sectors.",
        "Specialize in SaaS, IoT, SaMD, and e-commerce platforms.",
        "Implement CRM and sales automation using HubSpot and Salesforce.",
        "Modernize applications with Kubernetes and CI/CD/CT pipelines.",
        "Implemented advanced AI & Machine Learning solutions, significantly improving operational efficiency for diverse SMBs in FinTech and Health sectors."
      ],
      "Url": "https://hirefractionaltalent.com"
    },
    {
      "Name": "OnTheClock",
      "Position": "Site Reliability DevOps / Full Stack Engineer / Dev. Manager / CTO / Architect / Agile Practitioner",
      "Summary": "Led comprehensive technology transformation and team modernization.",
      "StartDate": "2024-04-01",
      "EndDate": "2024-11-01",
      "Highlights": [
        "Led onshore/offshore product engineering web & mobile teams and multiple vendor partners to deliver over 200 features in 8 months.",
        "Modernized all engineering processes by teaching Scrum and establishing metrics/scorecard by launching Jira.",
        "Transformed Release Management into DevSecOps + GitOps + Jira enabling the teams transition from manual 'ad hoc' to monthly delivery.",
        "Automated manual builds reducing cycle time and increasing deployment frequency.",
        "Transformed the Production release process to use SYMLINKS for near zero downtime deployments/rollbacks."
      ],
      "Url": "https://ontheclock.com"
    },
    {
      "Name": "Alliance Inspection Management",
      "Position": "VP of Technology/CIO",
      "Summary": "Drove digital transformation and operational excellence initiatives.",
      "StartDate": "2021-08-01",
      "EndDate": "2024-01-01",
      "Highlights": [
        "Reduced operating costs by $1.79M through IT process modernization and contract renegotiation.",
        "Lowered attrition by 90% by fostering a performance-based, people-first culture.",
        "Increased ticket completion by 92%, enhancing IT support and customer satisfaction by 30.",
        "Boosted product delivery efficiency, improving story completion from 57.45% to 84.8%."
      ],
      "Url": ""
    },
    {
      "Name": "Career Now Brands",
      "Position": "EVP/VP, Product & Technology",
      "Summary": "Led product development and technology strategy for multiple brand portfolio.",
      "StartDate": "2019-03-01",
      "EndDate": "2021-09-01",
      "Highlights": [
        "Increased project completion rate by 175% while cutting costs from $4M to $1.7M in the first year.",
        "Delivered 3 new products generating $6M+ in revenue within 2 years using a single framework.",
        "Instituted CI/CD and Agile best practices, restructuring software development processes.",
        "Led migration from DigitalOcean to AWS, ensuring seamless re-platforming and consolidation."
      ],
      "Url": ""
    },
    {
      "Name": "United Wholesale Mortgage",
      "Position": "Solutions Architecture, Team Lead",
      "Summary": "Defined enterprise architecture strategy and led cross-functional development teams.",
      "StartDate": "2017-12-01",
      "EndDate": "2019-03-01",
      "Highlights": [
        "Led a 10+ member cross-functional Solution Architecture Team, enhancing collaboration and efficiency.",
        "Defined Data Governance and Product Architecture strategies, driving 'nextgen' system development.",
        "Implemented SonarQube for SAST, significantly improving code quality and security."
      ],
      "Url": ""
    },
    {
      "Name": "Urban Science",
      "Position": "Principal Full Stack Software Engineer (Application Architect)",
      "Summary": "Led development of enterprise SaaS solutions and microservices architecture.",
      "StartDate": "2014-10-01",
      "EndDate": "2017-12-01",
      "Highlights": [
        "Led development of Contact Manager SaaS, managing 10+ engineers, enhancing user engagement.",
        "Optimized KPI Generator Microservice, improving performance and efficiency with a team of 5.",
        "Established CI/CD pipelines in Azure DevOps, streamlining deployment processes."
      ],
      "Url": ""
    },
    {
      "Name": "Dassault Systèmes 3DEXCITE",
      "Position": "Software Development Manager",
      "Summary": "Managed multiple SaaS product teams and standardized development processes.",
      "StartDate": "2013-10-01",
      "EndDate": "2014-10-01",
      "Highlights": [
        "Led three SaaS product teams with $3.5M budget, enhancing cross-functional collaboration and efficiency.",
        "Implemented SCRUM and TFS for RTT USA's Application Development, standardizing ALM Governance."
      ],
      "Url": ""
    },
    {
      "Name": "Urban Science",
      "Position": "Software Development Manager / Sr. Full Stack Software Engineer",
      "Summary": "Developed and managed multiple SaaS products with focus on scalability and performance.",
      "StartDate": "2008-03-01",
      "EndDate": "2013-10-01",
      "Highlights": [
        "Managed and developed multiple SaaS products, ensuring timely and budget-compliant delivery.",
        "Implemented a real-time OLAP SSAS solution for advanced reporting, enhancing data analysis."
      ],
      "Url": ""
    },
    {
      "Name": "Compuware",
      "Position": "Full Stack Software Engineer",
      "Summary": "Modernized legacy applications and implemented virtualization solutions.",
      "StartDate": "2006-04-01",
      "EndDate": "2008-01-01",
      "Highlights": [
        "Modernized VB6 applications to C# .Net, enhancing performance and maintainability.",
        "Implemented VMWare, reducing development setup time and costs."
      ],
      "Url": ""
    },
    {
      "Name": "RelatedNews.ca",
      "Position": "Founder",
      "Summary": "Founded and successfully exited a custom web development startup.",
      "StartDate": "1999-01-01",
      "EndDate": "2005-01-01",
      "Highlights": [
        "Founded and sold RelatedNews.ca, a startup for custom websites with unique CMS solutions.",
        "Architected Just-A-Click CMS, utilizing .Net, VB, C#, JavaScript, Java, and PHP."
      ],
      "Url": ""
    }
  ],
  "Volunteer": [
    {
      "Organization": "Mentors in Tech (MinT)",
      "Position": "Mentor",
      "Summary": "Providing guidance and support to emerging technology professionals.",
      "StartDate": "2023-01-01",
      "EndDate": "Present",
      "Highlights": [
        "Mentored 15+ junior developers in career advancement strategies.",
        "Conducted workshops on modern software architecture and leadership."
      ],
      "Url": "https://mentorsintech.org"
    },
    {
      "Organization": "Micromentor",
      "Position": "Mentor",
      "Summary": "Supporting small business owners with technology strategy and implementation.",
      "StartDate": "2022-12-01",
      "EndDate": "Present",
      "Highlights": [
        "Advised 8 small businesses on digital transformation initiatives.",
        "Helped implement cloud migration strategies for local businesses."
      ],
      "Url": "https://micromentor.org"
    },
    {
      "Organization": "SCORE Mentors",
      "Position": "Certified Business Mentor",
      "Summary": "Providing business mentorship to entrepreneurs and small business owners.",
      "StartDate": "2022-12-01",
      "EndDate": "Present",
      "Highlights": [
        "Mentored 12 startup founders on technology and business strategy.",
        "Led workshops on scaling technology teams and processes."
      ],
      "Url": "https://score.org"
    }
  ],
  "Education": [
    {
      "Institution": "University of Windsor",
      "Area": "Computer Science",
      "StudyType": "Bachelor",
      "StartDate": "1999-01-01",
      "EndDate": "2004-12-01",
      "Score": "3.8/4.0",
      "Courses": ["Data Structures", "Algorithms", "Software Engineering", "Database Systems"],
      "Url": "https://uwindsor.ca"
    },
    {
      "Institution": "University of Windsor",
      "Area": "Psychology",
      "StudyType": "Bachelor",
      "StartDate": "1999-01-01",
      "EndDate": "2004-12-01",
      "Score": "3.6/4.0",
      "Courses": ["Cognitive Psychology", "Research Methods", "Statistics"],
      "Url": "https://uwindsor.ca"
    }
  ],
  "Awards": [
    {
      "Title": "Technology Leader of the Year",
      "Date": "2023-11-15",
      "Awarder": "Detroit Tech Awards",
      "Summary": "Recognized for outstanding leadership in technology transformation and team development."
    }
  ],
  "Certificates": [
    {
      "Name": "AWS Solutions Architect Professional",
      "Date": "2023-03-15",
      "Issuer": "Amazon Web Services",
      "Url": "https://aws.amazon.com/certification/"
    },
    {
      "Name": "Certified Kubernetes Administrator",
      "Date": "2022-08-20",
      "Issuer": "Cloud Native Computing Foundation",
      "Url": "https://cncf.io"
    }
  ],
  "Publications": [
    {
      "Name": "Scaling Engineering Teams in High-Growth Startups",
      "Publisher": "Tech Leadership Quarterly",
      "ReleaseDate": "2023-09-01",
      "Url": "https://techleadership.com/articles/scaling-teams",
      "Summary": "A comprehensive guide to building and scaling engineering teams from 5 to 50+ engineers."
    }
  ],
  "Skills": [
    { "Name": "JavaScript", "Level": "Expert", "Keywords": ["React", "Node.js", "TypeScript"] },
    { "Name": "Cloud Architecture", "Level": "Expert", "Keywords": ["AWS", "Azure", "GCP"] },
    { "Name": "DevOps", "Level": "Advanced", "Keywords": ["Docker", "Kubernetes", "CI/CD"] },
    { "Name": "Leadership", "Level": "Expert", "Keywords": ["Team Building", "Strategy", "Mentoring"] },
    { "Name": "Python", "Level": "Advanced", "Keywords": ["Django", "FastAPI", "ML"] },
    { "Name": "Database Design", "Level": "Advanced", "Keywords": ["PostgreSQL", "MongoDB", "Redis"] }
  ],
  "Languages": [
    { "Language": "English", "Fluency": "Native" },
    { "Language": "French", "Fluency": "Conversational" }
  ],
  "Interests": [
    { "Name": "AI/Machine Learning", "Keywords": ["OpenAI", "TensorFlow", "AutoML"] },
    { "Name": "Startup Ecosystem", "Keywords": ["Venture Capital", "Product Strategy", "Growth"] },
    { "Name": "Music Production", "Keywords": ["Ableton", "Synthesis", "Audio Engineering"] }
  ],
  "References": [
    { "Name": "Available upon request", "Reference": "Professional references available upon request" }
  ],
  "Projects": [
    {
      "Name": "Enterprise SaaS Platform",
      "Description": "Led development of multi-tenant SaaS platform serving 100K+ users",
      "Highlights": ["Microservices architecture", "Real-time data processing", "99.9% uptime SLA"],
      "Keywords": ["React", "Node.js", "AWS", "Kubernetes"],
      "StartDate": "2022-01-01",
      "EndDate": "2023-12-01",
      "Url": "https://enterprise-platform.com",
      "Roles": ["Technical Lead", "Architect"],
      "Entity": "HireFractionalTalent.com",
      "Type": "SaaS Platform"
    }
  ]
};

export const MOCK_RESUMES: Resume[] = [
  {
    id: MOCK_RESUME_IDS.SEAN_HOGG_MASTER,
    slug: 'john-seeker-cto-resume',
    name: "John Seeker - CTO Resume",
    data: {
      ...SEAN_HOGG_RESUME_DATA,
      Basics: {
        ...SEAN_HOGG_RESUME_DATA.Basics,
        Name: "John Seeker",
        Email: "john.seeker@example.com",
        Image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"
      }
    },
    privacy: 'private',
    isMaster: true,
    isActive: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T14:30:00Z',
    views: 45,
    userId: 'u1a2b3c4-d5e6-7890-abcd-ef1234567890' // John Seeker (job_seeker)
  },
  {
    id: MOCK_RESUME_IDS.FRONTEND_SPECIALIST,
    slug: 'john-seeker-frontend-react-specialist',
    name: 'Frontend Developer - React Specialist',
    data: {
      ...SEAN_HOGG_RESUME_DATA,
      Basics: {
        ...SEAN_HOGG_RESUME_DATA.Basics,
        Name: "John Seeker",
        Label: "Senior Frontend Developer",
        Email: "john.seeker@example.com",
        Image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
        Summary: "Frontend specialist with expertise in React, TypeScript, and modern web technologies. Focused on creating amazing user experiences and scalable applications with 10+ years of experience in frontend development."
      },
      Work: SEAN_HOGG_RESUME_DATA.Work.filter(work =>
        work.Name.includes('OnTheClock') || work.Name.includes('Urban Science') || work.Name.includes('Career Now Brands')
      )
    },
    privacy: 'public',
    isMaster: false,
    isActive: true,
    parentId: MOCK_RESUME_IDS.SEAN_HOGG_MASTER,
    createdAt: '2024-01-22T09:15:00Z',
    updatedAt: '2024-01-22T16:45:00Z',
    views: 23,
    userId: 'u1a2b3c4-d5e6-7890-abcd-ef1234567890' // John Seeker (job_seeker)
  },
  {
    id: MOCK_RESUME_IDS.DEVOPS_ENGINEER,
    slug: 'john-seeker-devops-engineer',
    name: 'DevOps Engineer Resume',
    data: {
      ...SEAN_HOGG_RESUME_DATA,
      Basics: {
        ...SEAN_HOGG_RESUME_DATA.Basics,
        Name: "John Seeker",
        Label: "Senior DevOps Engineer",
        Email: "john.seeker@example.com",
        Image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
        Summary: "DevOps specialist with extensive experience in cloud infrastructure, CI/CD pipelines, and container orchestration. Passionate about automation and reliability with expertise in AWS, Kubernetes, and modern DevOps practices."
      },
      Work: SEAN_HOGG_RESUME_DATA.Work.filter(work =>
        work.Name.includes('OnTheClock') || work.Name.includes('Alliance') || work.Name.includes('Career Now Brands')
      )
    },
    privacy: 'recruiter_only',
    isMaster: false,
    isActive: false,
    parentId: MOCK_RESUME_IDS.SEAN_HOGG_MASTER,
    createdAt: '2024-01-25T11:30:00Z',
    updatedAt: '2024-01-25T15:20:00Z',
    views: 12,
    userId: 'u1a2b3c4-d5e6-7890-abcd-ef1234567890' // John Seeker (job_seeker)
  },
  {
    id: MOCK_RESUME_IDS.SARAH_CHEN_RESUME,
    slug: 'sarah-chen-software-engineer',
    name: 'Sarah Chen - Software Engineer',
    data: {
      Basics: {
        Name: "Sarah Chen",
        Label: "Senior Software Engineer",
        Image: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face",
        Email: "sarah.chen@example.com",
        Phone: "555-0123",
        Url: "https://sarahchen.dev",
        Summary: "Passionate software engineer with 8 years of experience building scalable web applications. Expertise in React, Node.js, and cloud technologies. Love solving complex problems and mentoring junior developers.",
        Location: {
          Address: "456 Innovation Drive",
          PostalCode: "94105",
          City: "San Francisco",
          CountryCode: "US",
          Region: "California"
        }
      },
      Work: [
        {
          Name: "TechCorp Inc",
          Position: "Senior Software Engineer",
          Summary: "Lead frontend development for enterprise SaaS platform",
          StartDate: "2021-03-01",
          EndDate: "Present",
          Highlights: [
            "Led development of React-based dashboard serving 50K+ users",
            "Improved application performance by 40% through optimization",
            "Mentored 5 junior developers"
          ],
          Url: "https://techcorp.com"
        }
      ],
      Volunteer: [],
      Education: [
        {
          Institution: "Stanford University",
          Area: "Computer Science",
          StudyType: "Bachelor",
          StartDate: "2012-09-01",
          EndDate: "2016-06-01",
          Score: "3.9/4.0",
          Courses: ["Algorithms", "Machine Learning", "Software Engineering"],
          Url: "https://stanford.edu"
        }
      ],
      Awards: [],
      Certificates: [],
      Publications: [],
      Skills: [
        { Name: "React", Level: "Expert", Keywords: ["Redux", "Hooks", "TypeScript"] },
        { Name: "Node.js", Level: "Advanced", Keywords: ["Express", "GraphQL", "APIs"] }
      ],
      Languages: [
        { Language: "English", Fluency: "Native" },
        { Language: "Mandarin", Fluency: "Native" }
      ],
      Interests: [],
      References: [],
      Projects: []
    },
    privacy: 'public',
    isMaster: true,
    isActive: true,
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-18T12:00:00Z',
    views: 67,
    userId: 'u4a5b6c7-d8e9-0123-4567-890123456789' // Alex Thompson
  },
  {
    id: MOCK_RESUME_IDS.MICHAEL_RODRIGUEZ,
    slug: 'michael-rodriguez-marketing-manager',
    name: 'Michael Rodriguez - Marketing Manager',
    data: {
      Basics: {
        Name: "Michael Rodriguez",
        Label: "Senior Marketing Manager",
        Image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
        Email: "michael.rodriguez@example.com",
        Phone: "555-0456",
        Url: "https://michaelrodriguez.marketing",
        Summary: "Results-driven marketing professional with 7 years of experience in digital marketing, brand management, and growth strategy. Proven track record of increasing brand awareness and driving revenue growth through innovative campaigns.",
        Location: {
          Address: "789 Marketing Ave",
          PostalCode: "10001",
          City: "New York",
          CountryCode: "US",
          Region: "New York"
        }
      },
      Work: [
        {
          Name: "GrowthCo",
          Position: "Senior Marketing Manager",
          Summary: "Led digital marketing initiatives for B2B SaaS company",
          StartDate: "2020-01-01",
          EndDate: "Present",
          Highlights: [
            "Increased lead generation by 150% through content marketing",
            "Managed $500K annual marketing budget",
            "Launched successful product campaigns generating $2M in revenue"
          ],
          Url: "https://growthco.com"
        }
      ],
      Volunteer: [],
      Education: [
        {
          Institution: "NYU Stern School of Business",
          Area: "Marketing",
          StudyType: "MBA",
          StartDate: "2016-09-01",
          EndDate: "2018-05-01",
          Score: "3.7/4.0",
          Courses: ["Digital Marketing", "Brand Management", "Analytics"],
          Url: "https://stern.nyu.edu"
        }
      ],
      Awards: [],
      Certificates: [],
      Publications: [],
      Skills: [
        { Name: "Digital Marketing", Level: "Expert", Keywords: ["SEM", "SEO", "Social Media"] },
        { Name: "Analytics", Level: "Advanced", Keywords: ["Google Analytics", "Tableau", "SQL"] }
      ],
      Languages: [
        { Language: "English", Fluency: "Native" },
        { Language: "Spanish", Fluency: "Native" }
      ],
      Interests: [],
      References: [],
      Projects: []
    },
    privacy: 'public',
    isMaster: true,
    isActive: false,
    createdAt: '2024-01-28T14:00:00Z',
    updatedAt: '2024-01-28T14:00:00Z',
    views: 2,
    userId: 'u5b6c7d8-e9f0-1234-5678-901234567890' // Maria Garcia
  },
  {
    id: MOCK_RESUME_IDS.JENNIFER_MARTINEZ_PRIVATE,
    slug: 'jennifer-martinez-data-scientist-private',
    name: 'Senior Data Scientist - Private',
    data: {
      ...SEAN_HOGG_RESUME_DATA,
      Basics: {
        ...SEAN_HOGG_RESUME_DATA.Basics,
        Name: "Jennifer Martinez",
        Label: "Senior Data Scientist | Machine Learning Expert",
        Email: "jennifer.martinez@example.com",
        Image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
        Summary: "Experienced data scientist with 10+ years in machine learning, predictive analytics, and AI solutions. Specialized in developing scalable ML models for fintech and healthcare industries. Passionate about turning complex data into actionable business insights.",
        Location: {
          Address: "456 Data Street",
          PostalCode: "78701",
          City: "Austin",
          CountryCode: "US",
          Region: "Texas"
        }
      },
      Work: [
        {
          Name: "DataTech Solutions",
          Position: "Senior Data Scientist",
          Summary: "Lead data science initiatives for enterprise clients, developing ML models that increased revenue by 25% on average.",
          StartDate: "2020-03-01",
          EndDate: "Present",
          Highlights: [
            "Built predictive models reducing customer churn by 40%",
            "Led team of 5 data scientists on complex analytics projects",
            "Implemented MLOps pipelines improving model deployment speed by 60%",
            "Developed real-time recommendation engine serving 1M+ users daily"
          ],
          Url: "https://datatechsolutions.com"
        },
        {
          Name: "FinanceAI Corp",
          Position: "Data Scientist",
          Summary: "Developed machine learning algorithms for fraud detection and risk assessment in financial services.",
          StartDate: "2017-06-01",
          EndDate: "2020-02-28",
          Highlights: [
            "Created fraud detection system with 95% accuracy",
            "Reduced false positives by 30% through advanced feature engineering",
            "Collaborated with product teams to integrate ML into customer-facing applications",
            "Published 3 research papers on anomaly detection techniques"
          ],
          Url: "https://financeai.com"
        }
      ],
      Education: [
        {
          Institution: "Stanford University",
          StudyType: "PhD",
          Area: "Computer Science - Machine Learning",
          StartDate: "2013-09-01",
          EndDate: "2017-05-15",
          Score: "4.0",
          Courses: ["Advanced Machine Learning", "Deep Learning", "Statistical Learning Theory"]
        },
        {
          Institution: "University of Texas at Austin",
          StudyType: "Master of Science",
          Area: "Statistics",
          StartDate: "2011-08-01",
          EndDate: "2013-05-15",
          Score: "3.9",
          Courses: ["Bayesian Statistics", "Time Series Analysis", "Multivariate Statistics"]
        }
      ],
      Skills: [
        {
          Name: "Machine Learning",
          Level: "Expert",
          Keywords: ["Python", "TensorFlow", "PyTorch", "Scikit-learn", "MLOps"]
        },
        {
          Name: "Data Engineering",
          Level: "Advanced",
          Keywords: ["Apache Spark", "Kafka", "Airflow", "SQL", "NoSQL"]
        },
        {
          Name: "Cloud Platforms",
          Level: "Intermediate",
          Keywords: ["AWS", "Docker", "Kubernetes", "SageMaker"]
        }
      ]
    },
    privacy: 'private',
    isMaster: true,
    isActive: false,
    createdAt: '2023-11-20T09:00:00Z',
    updatedAt: '2024-01-15T11:30:00Z',
    views: 0, // Private resume, no views
    userId: 'u1f2g3h4-i5j6-7890-1234-567890123456' // Jennifer Martinez
  }
];

export const MOCK_RESUME_METADATA: ResumeMetadata[] = MOCK_RESUMES.map(resume => ({
  id: resume.id,
  slug: resume.slug,
  name: resume.name,
  privacy: resume.privacy,
  isMaster: resume.isMaster,
  isActive: resume.isActive,
  parentId: resume.parentId,
  createdAt: resume.createdAt,
  updatedAt: resume.updatedAt,
  views: resume.views,
  summary: resume.data.Basics.Summary,
  title: resume.data.Basics.Label,
  userId: resume.userId
}));

// Helper functions
export const getResumeById = (id: string): Resume | undefined => {
  return MOCK_RESUMES.find(resume => resume.id === id);
};

export const getResumeBySlug = (slug: string): Resume | undefined => {
  return MOCK_RESUMES.find(resume => resume.slug === slug);
};

export const getResumeMetadataById = (id: string): ResumeMetadata | undefined => {
  return MOCK_RESUME_METADATA.find(resume => resume.id === id);
};

export const getResumesByUserId = (userId: string): Resume[] => {
  return MOCK_RESUMES.filter(resume => resume.userId === userId);
};

// Tracked resumes for recruiters and business users
export const TRACKED_RESUMES: { [userId: string]: string[] } = {
  'u2b3c4d5-e6f7-8901-bcde-f23456789012': [MOCK_RESUME_IDS.SARAH_CHEN_RESUME, MOCK_RESUME_IDS.FRONTEND_SPECIALIST], // Sarah Recruiter tracks these
  'u3c4d5e6-f7g8-9012-cdef-345678901234': [MOCK_RESUME_IDS.MICHAEL_RODRIGUEZ, MOCK_RESUME_IDS.DEVOPS_ENGINEER] // Michael Business tracks these
};

export const getTrackedResumesByUserId = (userId: string): Resume[] => {
  const trackedIds = TRACKED_RESUMES[userId] || [];
  return MOCK_RESUMES.filter(resume => trackedIds.includes(resume.id));
};

export const getAllResumesForUser = (userId: string): { owned: Resume[], tracked: Resume[] } => {
  const owned = getResumesByUserId(userId);
  const tracked = getTrackedResumesByUserId(userId);
  return { owned, tracked };
};

export const isResumeTrackedByUser = (resumeId: string, userId: string): boolean => {
  const trackedIds = TRACKED_RESUMES[userId] || [];
  return trackedIds.includes(resumeId);
};

export const addTrackedResume = (resumeId: string, userId: string): void => {
  if (!TRACKED_RESUMES[userId]) {
    TRACKED_RESUMES[userId] = [];
  }
  if (!TRACKED_RESUMES[userId].includes(resumeId)) {
    TRACKED_RESUMES[userId].push(resumeId);
  }
};

export const removeTrackedResume = (resumeId: string, userId: string): void => {
  if (TRACKED_RESUMES[userId]) {
    TRACKED_RESUMES[userId] = TRACKED_RESUMES[userId].filter(id => id !== resumeId);
  }
};

export const generateResumeId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
