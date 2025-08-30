import { useEffect } from 'react';

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  canonical?: string;
  robots?: string;
  author?: string;
  structuredData?: object;
}

/**
 * Default SEO configuration for the application
 */
export const DEFAULT_SEO: SEOData = {
  title: 'MyVideoResu.me - AI-Powered Video Resume Platform',
  description: 'Create compelling video resumes and connect with top talent through AI-powered matching. The future of recruitment is here.',
  keywords: 'video resume, recruitment, talent management, AI matching, job search, hiring, career development',
  ogTitle: 'MyVideoResu.me - Video Resume Platform',
  ogDescription: 'Create compelling video resumes and connect with top talent through AI-powered matching.',
  ogImage: 'https://myvideoresu.me/og-image.jpg',
  ogUrl: 'https://myvideoresu.me',
  twitterCard: 'summary_large_image',
  author: 'MyVideoResu.me',
  robots: 'index, follow',
};

/**
 * Page-specific SEO configurations
 */
export const PAGE_SEO: Record<string, SEOData> = {
  '/': {
    title: 'MyVideoResu.me - AI-Powered Video Resume Platform',
    description: 'Create compelling video resumes and connect with top talent through AI-powered matching. Join thousands of professionals revolutionizing recruitment.',
    keywords: 'video resume, AI recruitment, talent matching, job search, career development, professional networking',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'MyVideoResu.me',
      description: 'AI-powered video resume platform for modern recruitment',
      url: 'https://myvideoresu.me',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
    },
  },
  '/login': {
    title: 'Login - MyVideoResu.me',
    description: 'Sign in to your MyVideoResu.me account to access your video resumes, job applications, and professional network.',
    robots: 'noindex, nofollow',
  },
  '/signup': {
    title: 'Sign Up - MyVideoResu.me',
    description: 'Join MyVideoResu.me today and create your professional video resume. Connect with top employers and advance your career.',
    keywords: 'sign up, create account, video resume registration, join MyVideoResu.me',
  },
  '/pricing': {
    title: 'Pricing Plans - MyVideoResu.me',
    description: 'Choose the perfect plan for your career goals. Affordable pricing for job seekers, recruiters, and businesses.',
    keywords: 'pricing, plans, subscription, video resume cost, recruitment pricing',
  },
  '/for-recruiters': {
    title: 'For Recruiters - MyVideoResu.me',
    description: 'Discover top talent through video resumes. Advanced AI matching, candidate screening, and recruitment tools for modern hiring.',
    keywords: 'recruiters, hiring, talent acquisition, candidate screening, recruitment tools',
  },
  '/about': {
    title: 'About Us - MyVideoResu.me',
    description: 'Learn about MyVideoResu.me\'s mission to revolutionize recruitment through AI-powered video resumes and talent matching.',
    keywords: 'about us, company mission, video resume platform, recruitment innovation',
  },
  '/resumes': {
    title: 'Video Resumes - MyVideoResu.me',
    description: 'Create, manage, and share your professional video resumes. Stand out from the crowd with AI-enhanced resume building.',
    keywords: 'video resumes, resume builder, professional videos, career portfolio',
  },
  '/jobs': {
    title: 'Job Search - MyVideoResu.me',
    description: 'Find your dream job with AI-powered matching. Browse thousands of opportunities and apply with your video resume.',
    keywords: 'job search, career opportunities, employment, job listings, AI job matching',
  },
  '/companies': {
    title: 'Companies - MyVideoResu.me',
    description: 'Discover top companies hiring through video resumes. Connect with innovative employers and explore career opportunities.',
    keywords: 'companies, employers, hiring companies, career opportunities, company profiles',
  },
  '/people': {
    title: 'Professional Network - MyVideoResu.me',
    description: 'Connect with professionals, recruiters, and industry leaders. Build your network and advance your career.',
    keywords: 'professional networking, career connections, industry professionals, networking platform',
  },
  '/tasks': {
    title: 'Task Management - MyVideoResu.me',
    description: 'Organize your job search and career development with powerful task management tools. Stay on top of applications and follow-ups.',
    keywords: 'task management, job search organization, career planning, productivity tools',
  },
  '/outreach': {
    title: 'Professional Outreach - MyVideoResu.me',
    description: 'Manage your professional communications and networking outreach. Build relationships that advance your career.',
    keywords: 'professional outreach, networking, communication tools, relationship building',
  },
  '/account': {
    title: 'Account Management - MyVideoResu.me',
    description: 'Manage your account settings, team members, and organization preferences. Complete control over your MyVideoResu.me experience.',
    robots: 'noindex, nofollow',
  },
  '/settings': {
    title: 'Settings - MyVideoResu.me',
    description: 'Customize your MyVideoResu.me experience. Manage privacy, notifications, and account preferences.',
    robots: 'noindex, nofollow',
  },
  '/privacy-policy': {
    title: 'Privacy Policy - MyVideoResu.me',
    description: 'Learn how MyVideoResu.me protects your personal information and respects your privacy. Comprehensive privacy policy with multi-jurisdiction compliance.',
    keywords: 'privacy policy, data protection, GDPR compliance, user privacy, data security',
  },
  '/terms-of-service': {
    title: 'Terms of Service - MyVideoResu.me',
    description: 'Read our comprehensive terms of service. Understand your rights and responsibilities when using MyVideoResu.me.',
    keywords: 'terms of service, user agreement, legal terms, platform rules',
  },
  '/help': {
    title: 'Help & Support - MyVideoResu.me',
    description: 'Get help with MyVideoResu.me. Find answers to common questions and learn how to make the most of our platform.',
    keywords: 'help, support, FAQ, user guide, customer service',
  },
  '/tools': {
    title: 'Career Tools - MyVideoResu.me',
    description: 'Access powerful AI-driven career tools including sentiment analysis, job-resume matching, and career insights.',
    keywords: 'career tools, AI tools, job matching, sentiment analysis, career insights',
  },
  '/tools/sentiment-analysis': {
    title: 'Sentiment Analysis Tool - MyVideoResu.me',
    description: 'Analyze the sentiment and tone of your resume content with our AI-powered sentiment analysis tool.',
    keywords: 'sentiment analysis, resume analysis, AI tools, content optimization',
  },
  '/tools/job-resume-match': {
    title: 'Job Resume Matching Tool - MyVideoResu.me',
    description: 'Find the perfect match between jobs and resumes using our advanced AI matching algorithm.',
    keywords: 'job matching, resume matching, AI matching, career fit analysis',
  },
  '/contact': {
    title: 'Contact Us - MyVideoResu.me',
    description: 'Get in touch with MyVideoResu.me support team. We\'re here to help you succeed in your career journey with video resumes and AI-powered job matching.',
    keywords: 'contact us, customer support, help, video resume support, career assistance, MyVideoResu.me contact',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contact MyVideoResu.me',
      description: 'Contact page for MyVideoResu.me - AI-powered video resume platform',
      url: 'https://myvideoresu.me/contact',
      mainEntity: {
        '@type': 'Organization',
        name: 'MyVideoResu.me',
        email: 'info@myvideoresu.me',
        url: 'https://myvideoresu.me',
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          email: 'info@myvideoresu.me',
          availableLanguage: 'English'
        }
      }
    },
  },
};

/**
 * Update document meta tags
 */
export function updateMetaTags(seoData: SEOData): void {
  // Update title
  if (seoData.title) {
    document.title = seoData.title;
  }

  // Helper function to update or create meta tag
  const updateMetaTag = (name: string, content: string, property = false) => {
    const attribute = property ? 'property' : 'name';
    let meta = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;
    
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, name);
      document.head.appendChild(meta);
    }
    
    meta.setAttribute('content', content);
  };

  // Update meta tags
  if (seoData.description) updateMetaTag('description', seoData.description);
  if (seoData.keywords) updateMetaTag('keywords', seoData.keywords);
  if (seoData.author) updateMetaTag('author', seoData.author);
  if (seoData.robots) updateMetaTag('robots', seoData.robots);

  // Update Open Graph tags
  if (seoData.ogTitle) updateMetaTag('og:title', seoData.ogTitle, true);
  if (seoData.ogDescription) updateMetaTag('og:description', seoData.ogDescription, true);
  if (seoData.ogImage) updateMetaTag('og:image', seoData.ogImage, true);
  if (seoData.ogUrl) updateMetaTag('og:url', seoData.ogUrl, true);
  updateMetaTag('og:type', 'website', true);

  // Update Twitter Card tags
  if (seoData.twitterCard) updateMetaTag('twitter:card', seoData.twitterCard);
  if (seoData.twitterTitle) updateMetaTag('twitter:title', seoData.twitterTitle);
  if (seoData.twitterDescription) updateMetaTag('twitter:description', seoData.twitterDescription);
  if (seoData.twitterImage) updateMetaTag('twitter:image', seoData.twitterImage);

  // Update canonical URL
  if (seoData.canonical) {
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', seoData.canonical);
  }

  // Add structured data
  if (seoData.structuredData) {
    // Remove existing structured data
    const existingScript = document.querySelector('script[type="application/ld+json"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Add new structured data
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(seoData.structuredData);
    document.head.appendChild(script);
  }
}

/**
 * React hook for managing SEO
 */
export function useSEO(pathname: string, customSEO?: Partial<SEOData>): void {
  useEffect(() => {
    // Get page-specific SEO or use defaults
    const pageSEO = PAGE_SEO[pathname] || {};
    
    // Merge default, page-specific, and custom SEO data
    const seoData: SEOData = {
      ...DEFAULT_SEO,
      ...pageSEO,
      ...customSEO,
    };

    // Update canonical URL if not provided
    if (!seoData.canonical) {
      seoData.canonical = `https://myvideoresu.me${pathname}`;
    }

    // Update Open Graph URL if not provided
    if (!seoData.ogUrl) {
      seoData.ogUrl = `https://myvideoresu.me${pathname}`;
    }

    // Update meta tags
    updateMetaTags(seoData);

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      // Only reset if we're navigating away from the current page
      if (window.location.pathname !== pathname) {
        updateMetaTags(DEFAULT_SEO);
      }
    };
  }, [pathname, customSEO]);
}

/**
 * Generate structured data for different content types
 */
export const generateStructuredData = {
  jobPosting: (job: any) => ({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.postedDate,
    employmentType: job.employmentType?.toUpperCase(),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.companyName,
    },
    jobLocation: {
      '@type': 'Place',
      address: job.location,
    },
    baseSalary: job.salaryRange ? {
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: {
        '@type': 'QuantitativeValue',
        value: job.salaryRange,
      },
    } : undefined,
  }),

  organization: (company: any) => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.name,
    description: company.description,
    url: company.website,
    logo: company.logo,
    address: company.address,
  }),

  person: (person: any) => ({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: person.name,
    jobTitle: person.title,
    description: person.bio,
    image: person.avatar,
    url: `https://myvideoresu.me/people/${person.id}`,
  }),
};
