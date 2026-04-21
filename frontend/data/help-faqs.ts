// Static help content surfaced by /help and the unified search. Grouping FAQs
// by category keeps the Help page UX intact; the search layer flattens this
// into individual Q&A cards so users can land directly on an answer.

export interface HelpFaq {
  question: string;
  answer: string;
}

export interface HelpFaqCategory {
  category: string;
  questions: HelpFaq[];
}

export const HELP_FAQS: HelpFaqCategory[] = [
  {
    category: "Getting Started",
    questions: [
      {
        question: "How do I create my first video resume?",
        answer:
          "To create your video resume, go to the Resumes section and click 'Create Video Resume'. You can either upload your own video or use our AI-powered video generation tool to create one from your existing resume.",
      },
      {
        question: "What file formats are supported for uploads?",
        answer:
          "We support common video formats (MP4, MOV, AVI) for video uploads and PDF, DOC, DOCX for text resumes. Maximum file size is 100MB for videos and 10MB for documents.",
      },
      {
        question: "How do I set up my profile?",
        answer:
          "After signing up, you'll be guided through our onboarding process. Complete your profile by adding your personal information, work experience, skills, and upload your resume or create a video resume.",
      },
    ],
  },
  {
    category: "Account & Settings",
    questions: [
      {
        question: "How do I change my password?",
        answer:
          "Go to Settings > Account and click 'Change Password'. You'll need to enter your current password and choose a new one.",
      },
      {
        question: "Can I change my persona type after registration?",
        answer:
          "Yes, you can update your role (Job Seeker, Recruiter, Employer) in your Profile settings. Note that this will change your dashboard and available features.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "Account deletion can be done from Settings > Account > Delete Account. This action is permanent and cannot be undone.",
      },
    ],
  },
  {
    category: "Video Resumes",
    questions: [
      {
        question: "What makes a good video resume?",
        answer:
          "A good video resume should be 1-3 minutes long, professionally presented, highlight your key skills and experience, and include a clear call to action. Use good lighting and audio quality.",
      },
      {
        question: "Can I edit my video resume after uploading?",
        answer:
          "Yes, you can edit the title, description, and tags of your video resume. To change the video content itself, you'll need to upload a new version.",
      },
      {
        question: "How do I make my video resume private?",
        answer:
          "In your video resume settings, you can change the visibility to 'Private', 'Unlisted', or 'Public'. Private videos are only visible to you.",
      },
    ],
  },
  {
    category: "Job Search",
    questions: [
      {
        question: "How does job matching work?",
        answer:
          "Our AI analyzes your profile, skills, and preferences to match you with relevant job opportunities. You can refine matches by updating your preferences in Settings.",
      },
      {
        question: "Can I track my job applications?",
        answer:
          "Yes, the Jobs section includes an application tracker where you can monitor the status of all your applications and set follow-up reminders.",
      },
      {
        question: "How do I get notified about new job matches?",
        answer:
          "Enable job notifications in Settings > Notifications. You can choose to receive alerts via email or push notifications.",
      },
    ],
  },
  {
    category: "For Recruiters",
    questions: [
      {
        question: "How do I post a job opening?",
        answer:
          "Go to the Jobs section and click 'Post New Job'. Fill in the job details, requirements, and company information. Your posting will be visible to matching candidates.",
      },
      {
        question: "Can I search for candidates by specific criteria?",
        answer:
          "Yes, use the People section to search and filter candidates by skills, experience level, location, and other criteria. You can save searches for future use.",
      },
      {
        question: "How do I manage my candidate pipeline?",
        answer:
          "The Dashboard provides a pipeline view where you can track candidates through different stages of your hiring process, from initial contact to hiring.",
      },
    ],
  },
];

export interface HelpGuide {
  title: string;
  description: string;
  link: string;
}

export const HELP_GUIDES: HelpGuide[] = [
  {
    title: "Getting Started Guide",
    description:
      "Complete guide to setting up your profile and creating your first video resume",
    link: "/guides/getting-started",
  },
  {
    title: "Video Resume Best Practices",
    description:
      "Tips and tricks for creating compelling video resumes that get results",
    link: "/guides/video-best-practices",
  },
  {
    title: "Networking Tips",
    description:
      "How to build professional connections and leverage your network",
    link: "/guides/networking",
  },
  {
    title: "Job Search Strategies",
    description: "Proven strategies for finding and landing your dream job",
    link: "/guides/job-search",
  },
  {
    title: "Tutorials",
    description: "Step-by-step tutorials for every feature of hired.video",
    link: "/guides/tutorials",
  },
];
