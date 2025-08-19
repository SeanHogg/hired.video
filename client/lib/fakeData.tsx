import type { Company } from "@/types/company";
import type { Job } from "@/types/job";
import type { UserProfile } from "@/types/people";
import type { Resume } from "@/types/resume";

export const generateFakeCompanyData = (realCompany: Company): Company => {
  return {
    ...realCompany,
    data: {
      ...realCompany.data,
      description:
        "Join our dynamic team of innovators working on cutting-edge solutions that shape the future of technology. We offer competitive compensation, comprehensive benefits, and unlimited growth opportunities in a collaborative environment.",
      tagline: "Building the future, one innovation at a time",
      industry: "Technology & Innovation",
      size: "100-500",
      founded: 2018,
      mission:
        "To revolutionize how people connect and work together through innovative technology solutions.",
      vision:
        "A world where technology empowers every individual to reach their full potential.",
      culture: [
        "Innovation",
        "Collaboration",
        "Growth",
        "Transparency",
        "Work-Life Balance",
      ],
      values: [
        "Customer obsession drives everything we do",
        "Innovation is at the heart of our solutions",
        "We believe in the power of diverse teams",
        "Continuous learning fuels our growth",
      ],
      technologies: [
        "React",
        "TypeScript",
        "Node.js",
        "AWS",
        "Docker",
        "Kubernetes",
      ],
      perks: [
        "Remote Work",
        "Flexible Hours",
        "Learning Budget",
        "Team Outings",
      ],
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        visionInsurance: true,
        retirement401k: true,
        retirementPlan: true,
        stockOptions: true,
        paidTimeOff: true,
        parentalLeave: true,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: true,
        professionalDevelopment: true,
        gymMembership: false,
        freeFood: true,
        commuteBenefits: true,
        other: [
          "Annual team retreats",
          "Mental health support",
          "Home office stipend",
        ],
      },
      contact: {
        website: "https://company-website.com",
        email: "careers@company.com",
        phone: "+1 (555) 123-4567",
        linkedin: "https://linkedin.com/company/example",
        twitter: "https://twitter.com/company",
      },
      headquarters: {
        city: "San Francisco",
        state: "CA",
        country: "United States",
      },
      locations: [
        { city: "New York", state: "NY", country: "United States" },
        { city: "Austin", state: "TX", country: "United States" },
        { city: "Remote", state: "", country: "Global" },
      ],
      financials: {
        fundingStage: "series-b",
        totalFunding: 50000000,
        investors: [
          "Venture Capital Fund",
          "Angel Investors",
          "Strategic Partners",
        ],
      },
    },
    views: 1247,
    followers: 892,
    jobCount: 12,
    activeJobCount: 8,
    teamMembers: [],
  };
};

export const generateFakeJobData = (realJob: Job): Job => {
  return {
    ...realJob,
    data: {
      ...realJob.data,
      title: realJob.data.title, // Keep real title
      company: realJob.data.company, // Keep real company
      summary:
        "Join our innovative team and help build the next generation of technology solutions. This role offers exciting challenges, growth opportunities, and the chance to work with cutting-edge technologies in a collaborative environment.",
      description: `
<h3>About This Role</h3>
<p>We're looking for a talented professional to join our growing team. This is an excellent opportunity to make a significant impact while working with the latest technologies and methodologies.</p>

<h3>Key Responsibilities</h3>
<ul>
  <li>Develop and maintain high-quality software solutions</li>
  <li>Collaborate with cross-functional teams to deliver exceptional results</li>
  <li>Participate in code reviews and technical discussions</li>
  <li>Contribute to architectural decisions and best practices</li>
  <li>Mentor junior team members and share knowledge</li>
</ul>

<h3>Requirements</h3>
<ul>
  <li>Bachelor's degree in Computer Science or related field</li>
  <li>3+ years of professional software development experience</li>
  <li>Strong problem-solving and analytical skills</li>
  <li>Experience with modern development frameworks</li>
  <li>Excellent communication and teamwork abilities</li>
</ul>

<h3>Nice to Have</h3>
<ul>
  <li>Experience with cloud platforms (AWS, Azure, GCP)</li>
  <li>Knowledge of DevOps practices and tools</li>
  <li>Previous experience in agile development environments</li>
  <li>Contributions to open-source projects</li>
</ul>
      `,
      requirements: [
        {
          skill: "Bachelor's degree in relevant field",
          level: "Beginner",
          required: true,
        },
        {
          skill: "3+ years of professional experience",
          level: "Intermediate",
          required: true,
        },
        {
          skill: "Strong technical and communication skills",
          level: "Intermediate",
          required: true,
        },
        {
          skill: "Experience with modern development tools",
          level: "Intermediate",
          required: false,
        },
      ],
      responsibilities: [
        "Develop high-quality software solutions",
        "Collaborate with cross-functional teams",
        "Participate in code reviews and architecture discussions",
        "Mentor team members and share knowledge",
      ],
      qualifications: [
        "Bachelor's degree in Computer Science or related field",
        "Proven track record of successful project delivery",
        "Strong problem-solving abilities",
        "Excellent written and verbal communication",
      ],
      skills: ["JavaScript", "React", "Node.js", "TypeScript", "AWS"],
      benefits: [
        {
          type: "Compensation",
          description: "Competitive salary and equity package",
        },
        {
          type: "Health Insurance",
          description: "Comprehensive health, dental, and vision insurance",
        },
        {
          type: "Work Flexibility",
          description: "Flexible work arrangements and remote options",
        },
        {
          type: "Professional Development",
          description: "Professional development budget",
        },
        {
          type: "Time Off",
          description: "Generous PTO and parental leave",
        },
      ],
      salaryMin: 80000,
      salaryMax: 120000,
      location: {
        city: "San Francisco",
        state: "CA",
        country: "United States",
        remote: true,
        hybrid: false,
        timezone: "PST",
      },
      employmentType: "full-time",
      experienceLevel: "mid",
      category: "Engineering",
      tags: ["Remote", "Full-time", "Benefits", "Growth"],
    },
    views: 456,
    applications: 23,
  };
};

export const generateFakePersonData = (
  realPerson: UserProfile,
): UserProfile => {
  return {
    ...realPerson,
    data: {
      ...realPerson.data,
      firstName: realPerson.data.firstName, // Keep real name
      lastName: realPerson.data.lastName, // Keep real name
      headline: "Experienced Professional | Innovation Leader | Team Builder",
      summary:
        "Passionate professional with extensive experience in driving innovation and building high-performing teams. Proven track record of delivering results in fast-paced environments while fostering collaborative cultures.",
      location: {
        city: "San Francisco",
        state: "CA",
        country: "United States",
        remote: true,
        timezone: "PST",
      },
      contact: {
        email: "professional@email.com",
        phone: "+1 (555) 123-4567",
        website: "https://professional-portfolio.com",
        linkedin: "https://linkedin.com/in/professional",
        twitter: "https://twitter.com/professional",
      },
      experience: [
        {
          company: "Tech Innovation Corp",
          title: "Senior Manager",
          startDate: "2020-01-01",
          endDate: null,
          isCurrent: true,
          description:
            "Leading cross-functional teams to deliver innovative solutions that drive business growth and customer satisfaction.",
          technologies: ["Leadership", "Strategy", "Innovation"],
          achievements: [
            "Increased team productivity by 40%",
            "Led successful product launch reaching 1M+ users",
            "Implemented agile practices across organization",
          ],
        },
        {
          company: "Growth Solutions Inc",
          title: "Project Manager",
          startDate: "2017-06-01",
          endDate: "2019-12-31",
          isCurrent: false,
          description:
            "Managed complex projects and coordinated with stakeholders to ensure timely delivery and quality outcomes.",
          technologies: [
            "Project Management",
            "Agile",
            "Stakeholder Management",
          ],
          achievements: [
            "Delivered 15+ projects on time and under budget",
            "Improved client satisfaction scores by 35%",
            "Streamlined project workflows and processes",
          ],
        },
      ],
      education: [
        {
          school: "University of Technology",
          degree: "Master of Business Administration",
          field: "Technology Management",
          startDate: "2015-09-01",
          endDate: "2017-05-31",
          gpa: "3.8",
          description:
            "Focused on technology leadership and innovation management",
        },
        {
          school: "State University",
          degree: "Bachelor of Science",
          field: "Computer Science",
          startDate: "2011-09-01",
          endDate: "2015-05-31",
          gpa: "3.6",
          description:
            "Computer Science fundamentals with focus on software engineering",
        },
      ],
      skills: [
        {
          name: "Leadership",
          level: "Expert",
          endorsed: true,
          endorsements: 45,
        },
        {
          name: "Project Management",
          level: "Advanced",
          endorsed: true,
          endorsements: 38,
        },
        {
          name: "Strategic Planning",
          level: "Advanced",
          endorsed: true,
          endorsements: 32,
        },
        {
          name: "Team Building",
          level: "Expert",
          endorsed: true,
          endorsements: 28,
        },
        {
          name: "Innovation",
          level: "Advanced",
          endorsed: true,
          endorsements: 25,
        },
      ],
      certifications: [
        "Project Management Professional (PMP) - 2019",
        "Certified ScrumMaster - 2018",
      ],
      projects: [
        {
          name: "Digital Transformation Initiative",
          description:
            "Led company-wide digital transformation resulting in 50% efficiency improvement",
          startDate: "2021-01-01",
          endDate: "2022-12-31",
          technologies: [
            "Digital Strategy",
            "Change Management",
            "Process Optimization",
          ],
          link: "https://project-portfolio.com/digital-transformation",
        },
      ],
      languages: ["English", "Spanish"],
      openToWork: true,
      preferredRoles: ["Senior Manager", "Director", "VP of Operations"],
      salaryExpectation: {
        min: 120000,
        max: 180000,
        currency: "USD",
      },
    },
    profileViews: 342,
    connectionCount: 856,
    followerCount: 234,
  };
};

export const generateFakeResumeData = (realResume: Resume): Resume => {
  return {
    ...realResume,
    name: realResume.name, // Keep real name
    data: {
      Basics: {
        Name: realResume.data.Basics.Name, // Keep real name
        Label: "Senior Professional & Innovation Leader",
        Image: "",
        Email: "professional@example.com",
        Phone: "(555) 123-4567",
        Url: "https://professional-portfolio.com",
        Summary:
          "Experienced professional with a proven track record of driving innovation and leading high-performing teams. Passionate about technology and committed to delivering exceptional results that exceed expectations.",
        Location: {
          Address: "123 Main Street",
          PostalCode: "94105",
          City: "San Francisco",
          CountryCode: "US",
          Region: "CA",
        },
      },
      Work: [
        {
          Name: "Tech Innovation Corp",
          Position: "Senior Manager",
          Summary:
            "Leading cross-functional teams and driving strategic initiatives that deliver measurable business impact",
          StartDate: "2020-01-01",
          EndDate: "",
          Highlights: [
            "Increased team productivity by 40% through process optimization",
            "Led product launch that reached 1M+ active users",
            "Implemented agile methodologies across the organization",
            "Managed $2M+ annual budget with 15% cost savings",
          ],
          Url: "https://techinnovation.com",
        },
        {
          Name: "Growth Solutions Inc",
          Position: "Project Manager",
          Summary:
            "Managed complex projects and coordinated cross-functional teams to deliver high-quality solutions",
          StartDate: "2017-06-01",
          EndDate: "2019-12-31",
          Highlights: [
            "Successfully delivered 15+ projects on time and under budget",
            "Improved client satisfaction scores by 35%",
            "Streamlined project workflows reducing delivery time by 25%",
            "Mentored 5 junior team members in project management best practices",
          ],
          Url: "https://growthsolutions.com",
        },
      ],
      Volunteer: [
        {
          Organization: "Tech for Good",
          Position: "Volunteer Mentor",
          Summary:
            "Mentoring aspiring professionals in technology and career development",
          StartDate: "2019-01-01",
          EndDate: "",
          Highlights: [
            "Mentored 20+ individuals in career transitions",
            "Organized monthly networking events for 100+ participants",
            "Developed curriculum for professional development workshops",
          ],
          Url: "https://techforgood.org",
        },
      ],
      Education: [
        {
          Institution: "University of Technology",
          Area: "Technology Management",
          StudyType: "Master of Business Administration",
          StartDate: "2015-09-01",
          EndDate: "2017-05-31",
          Score: "3.8 GPA",
          Courses: [
            "Strategic Leadership",
            "Innovation Management",
            "Technology Strategy",
          ],
          Url: "https://universityoftech.edu",
        },
        {
          Institution: "State University",
          Area: "Computer Science",
          StudyType: "Bachelor of Science",
          StartDate: "2011-09-01",
          EndDate: "2015-05-31",
          Score: "3.6 GPA",
          Courses: ["Software Engineering", "Database Systems", "Algorithms"],
          Url: "https://stateuniversity.edu",
        },
      ],
      Awards: [
        {
          Title: "Excellence in Leadership Award",
          Date: "2022-12-01",
          Awarder: "Tech Innovation Corp",
          Summary:
            "Recognized for outstanding leadership and team development achievements",
        },
        {
          Title: "Innovation Champion",
          Date: "2021-06-01",
          Awarder: "Industry Association",
          Summary:
            "Awarded for driving innovative solutions and process improvements",
        },
      ],
      Certificates: [
        {
          Name: "Project Management Professional (PMP)",
          Date: "2019-03-01",
          Issuer: "Project Management Institute",
          Url: "https://pmi.org",
        },
        {
          Name: "Certified ScrumMaster",
          Date: "2018-08-01",
          Issuer: "Scrum Alliance",
          Url: "https://scrumalliance.org",
        },
      ],
      Publications: [
        {
          Name: "Modern Leadership in Technology Organizations",
          Publisher: "Tech Leadership Journal",
          ReleaseDate: "2022-09-01",
          Summary:
            "Exploring effective leadership strategies in rapidly evolving technology environments",
          Url: "https://techjournal.com/modern-leadership",
        },
      ],
      Skills: [
        {
          Name: "Leadership",
          Level: "Expert",
          Keywords: ["Team Management", "Strategic Planning", "Mentoring"],
        },
        {
          Name: "Project Management",
          Level: "Advanced",
          Keywords: ["Agile", "Scrum", "Waterfall"],
        },
        {
          Name: "Strategic Planning",
          Level: "Advanced",
          Keywords: ["Business Strategy", "Innovation", "Growth"],
        },
        {
          Name: "Communication",
          Level: "Expert",
          Keywords: ["Public Speaking", "Writing", "Presentation"],
        },
        {
          Name: "Technology",
          Level: "Advanced",
          Keywords: [
            "Software Development",
            "Digital Transformation",
            "Innovation",
          ],
        },
      ],
      Languages: [
        { Language: "English", Fluency: "Native speaker" },
        { Language: "Spanish", Fluency: "Conversational" },
      ],
      Interests: [
        {
          Name: "Technology Innovation",
          Keywords: ["AI", "Machine Learning", "Emerging Tech"],
        },
        {
          Name: "Leadership Development",
          Keywords: ["Coaching", "Mentoring", "Team Building"],
        },
        {
          Name: "Community Service",
          Keywords: ["Volunteering", "Mentorship", "Social Impact"],
        },
      ],
      References: [
        {
          Name: "Jane Smith",
          Reference:
            "Outstanding leader with exceptional ability to drive results and develop teams",
        },
        {
          Name: "John Doe",
          Reference:
            "Innovative professional who consistently delivers beyond expectations",
        },
      ],
      Projects: [
        {
          Name: "Digital Transformation Initiative",
          Description:
            "Led company-wide digital transformation resulting in 50% efficiency improvement and $1M+ cost savings",
          Highlights: [
            "Developed comprehensive digital strategy",
            "Coordinated with 10+ departments",
            "Achieved ROI of 300% within 18 months",
          ],
          StartDate: "2021-01-01",
          EndDate: "2022-12-31",
          Url: "https://portfolio.com/digital-transformation",
          Roles: ["Project Lead", "Strategy Development", "Change Management"],
          Entity: "Tech Innovation Corp",
          Type: "Professional",
          Keywords: ["Digital Transformation", "Enterprise", "Technology"],
        },
      ],
    },
    views: 234,
  };
};
