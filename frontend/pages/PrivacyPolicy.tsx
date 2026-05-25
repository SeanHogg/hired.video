import {
  Shield,
  Eye,
  Lock,
  Server,
  Users,
  Mail,
  Calendar,
  FileText,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { JurisdictionSelector } from "@/components/legal/JurisdictionSelector";
import {
  USCaliforniaRightsSection,
  PIPEDARightsSection,
  QuebecLaw25Section,
  MexicoARCOSection,
  GDPRRightsSection,
} from "@/components/legal/RegionalPrivacySections";

export default function PrivacyPolicy() {
  const location = useLocation();

  // SEO for privacy policy page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Privacy Policy", url: "/privacy-policy" }]);
  const { isAuthenticated } = useAuth();

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-4">
                <Shield className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Privacy Policy
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">Your Privacy Matters</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                This policy applies to all processing of personal data carried
                out by hired.video and has the objective of informing the
                user regarding the way in which hired.video carries out the
                processing of personal data (including details of the type of
                personal data collected and the purpose of processing) and
                regarding the rights of the user in relation to their personal
                data.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: March 30, 2025
              </p>
              <div className="mt-6 flex justify-center">
                <JurisdictionSelector />
              </div>
            </div>

            {/* Quick Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Quick Overview
                </CardTitle>
                <CardDescription>
                  Here's what you need to know about your privacy on
                  hired.video
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Lock className="h-5 w-5 text-green-600 mt-1" />
                    <div>
                      <h4 className="font-medium">Your Data is Secure</h4>
                      <p className="text-sm text-muted-foreground">
                        We use industry-standard encryption and security
                        measures
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <h4 className="font-medium">You Control Your Info</h4>
                      <p className="text-sm text-muted-foreground">
                        You can view, edit, or delete your personal data anytime
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Server className="h-5 w-5 text-purple-600 mt-1" />
                    <div>
                      <h4 className="font-medium">Minimal Data Collection</h4>
                      <p className="text-sm text-muted-foreground">
                        We only collect what's necessary to provide our service
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-orange-600 mt-1" />
                    <div>
                      <h4 className="font-medium">WE DO NOT SELL DATA</h4>
                      <p className="text-sm text-muted-foreground">
                        We never sell your personal information to third parties
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Contact Information
                </CardTitle>
                <CardDescription>
                  How to reach us with questions about this Privacy Policy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  In case of having any questions about the Privacy Policy, you
                  can contact hired.video through the following means:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Company Information</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        <strong>Trade name:</strong> hired.video
                      </li>
                      <li>
                        <strong>Identity of the controller:</strong> Fix Faster
                        LLC (c/o HireFractionalTalent.com)
                      </li>
                      <li>
                        <strong>Address:</strong> Troy, MI
                      </li>
                      <li>
                        <strong>Phone:</strong> 2488250176
                      </li>
                      <li>
                        <strong>Email:</strong> info@hired.video
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Data Protection Officer</h4>
                    <p className="text-sm text-muted-foreground">
                      For privacy inquiries, data subject access / deletion /
                      portability requests, or to exercise any rights described
                      in this policy, contact our Data Protection Officer at{" "}
                      <a
                        href="mailto:privacy@hired.video"
                        className="underline hover:text-foreground"
                      >
                        privacy@hired.video
                      </a>
                      . For residents of California, you may also use our{" "}
                      <a
                        href="/privacy/opt-out"
                        className="underline hover:text-foreground"
                      >
                        Do Not Sell or Share My Personal Information
                      </a>{" "}
                      page. For residents of Canada, our designated Privacy
                      Officer can be reached at the same address.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Regulatory Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Regulatory Compliance
                </CardTitle>
                <CardDescription>
                  We comply with current regulations on the protection of
                  personal data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  In compliance with current regulations on the protection of
                  personal data, especially:
                </p>
                <div className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <ul className="space-y-1">
                    <li>• Regulation (EU) 2016/679 (GDPR)</li>
                    <li>• California Privacy Rights Act 2023 (CPRA)</li>
                    <li>• Virginia Consumer Data Protection Act (VCDPA)</li>
                    <li>• Colorado Privacy Act (CPA)</li>
                    <li>• Connecticut Data Privacy Act (CTDPA)</li>
                    <li>• Canada's Anti-Spam Legislation (CASL) & PIPEDA</li>
                    <li>
                      • Mexican Federal Law on Protection of Personal Data
                      (LFPDPPP)
                    </li>
                    <li>• Utah Consumer Privacy Act (UCPA)</li>
                    <li>
                      • Tennessee Information Privacy Protection Act (TIPA)
                    </li>
                  </ul>
                  <ul className="space-y-1">
                    <li>• Texas Data Privacy and Security Act (TDPSA)</li>
                    <li>• Indiana Consumer Data Privacy Act (INCDPA)</li>
                    <li>• Iowa Consumer Data Privacy Act (ICDPA)</li>
                    <li>• Montana Consumer Data Privacy Act (MTCDPA)</li>
                    <li>• Delaware Personal Data Protection Act (DPDPA)</li>
                    <li>• Kentucky Consumer Data Privacy Act (KCDPA)</li>
                    <li>• New Jersey Data Protection Act (NJDPA)</li>
                    <li>• Oregon Consumer Privacy Act (OCPA)</li>
                    <li>• New Hampshire Privacy Act (NHPA)</li>
                    <li>• Nebraska Data Privacy Act (NDPA)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Region-specific rights — each component self-gates via
                useUserJurisdiction; mount all of them, the matching one
                renders, the rest return null. Drives the "viewing as"
                selector at the top of the page. */}
            <USCaliforniaRightsSection />
            <PIPEDARightsSection />
            <QuebecLaw25Section />
            <MexicoARCOSection />
            <GDPRRightsSection />

            {/* Detailed Sections */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>1. Information We Collect</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground mb-4">
                    hired.video collects information when visiting their web
                    page, and mainly by completing its registration forms. The
                    following data is collected: full name, email, phone number,
                    address and specific geolocation data.
                  </p>

                  <div>
                    <h4 className="font-medium mb-2">
                      How We Collect Personal Data
                    </h4>
                    <p className="text-muted-foreground mb-2">
                      hired.video collects personal data when the user:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Completes the forms of hired.video ('Site')</li>
                      <li>Subscribes to the newsletter</li>
                      <li>Answers a poll or completes a web form</li>
                      <li>Completes a printed form</li>
                      <li>
                        Sends an email or communicates by phone, which are then
                        loaded in the corresponding forms
                      </li>
                    </ul>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">
                      Personal Information Collected
                    </h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Full name and email address</li>
                      <li>Phone number and address</li>
                      <li>Specific geolocation data</li>
                      <li>
                        Professional information (job title, experience, skills)
                      </li>
                      <li>Profile photo and video resume content</li>
                      <li>Contact information you choose to share</li>
                    </ul>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Usage Information</h4>
                    <p className="text-muted-foreground mb-2">
                      We automatically collect:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>
                        How you use our platform (pages visited, features used)
                      </li>
                      <li>
                        Device information (browser type, operating system)
                      </li>
                      <li>Log data (IP address, access times)</li>
                      <li>Cookies and similar tracking technologies</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      <strong>Data Accuracy:</strong> The user declares and
                      guarantees that all the data provided are true and correct
                      and undertakes to keep them updated. Any false or
                      inaccurate statement will be the responsibility of the
                      user.
                    </p>
                  </div>
                </CardContent>

	                  <Separator />

	                  <div>
	                    <h4 className="font-medium mb-2">Role-Based Information</h4>
	                    <p className="text-muted-foreground mb-2">
	                      We process certain information depending on your role in the platform:
	                    </p>
	                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
	                      <li>
	                        <strong>Job Seekers:</strong> resume content (text and video), work history, skills, profile details, and signals you choose to make public to employers/recruiters.
	                      </li>
	                      <li>
	                        <strong>Employers:</strong> company profile, job postings, recruiting activity, and communications necessary to evaluate candidates.
	                      </li>
	                      <li>
	                        <strong>Recruiters:</strong> talent searches, candidate communications, and engagement metrics necessary to facilitate recruiting.
	                      </li>
	                      <li>
	                        <strong>Affiliates:</strong> referral codes, referral links, and limited performance metrics related to referrals (e.g., clicks, signups, qualifying purchases) for attribution and payouts.
	                      </li>
	                    </ul>
	                  </div>

	                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
	                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Affiliate Program Data</h4>
	                    <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 text-sm space-y-1 ml-4">
	                      <li>
	                        <strong>Attribution:</strong> We may capture referral codes from URL parameters (e.g., "ref") and use cookies/session storage to attribute referrals. This enables fair crediting of commissions to affiliates.
	                      </li>
	                      <li>
	                        <strong>Payout Records:</strong> We maintain records of qualifying transactions, commission calculations (25% of first month subscription only), and payout status. We may collect payee details (e.g., email, account ID) to process payouts.
	                      </li>
	                      <li>
	                        <strong>Compliance:</strong> Where required by law, we may collect tax and compliance information (e.g., forms or declarations) before releasing payouts. We do not sell affiliate data.
	                      </li>
	                      <li>
	                        <strong>Retention:</strong> Affiliate-related records are retained consistent with our retention policy and legal obligations (e.g., financial recordkeeping). We minimize the data retained to what is necessary for attribution and payouts.
	                      </li>
	                    </ul>
	                  </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>2. How We Use Your Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">
                        To Provide Our Service and Fulfill Your Requests
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Create and maintain your account</li>
                        <li>Process and store your video resumes</li>
                        <li>Match you with relevant job opportunities</li>
                        <li>
                          Enable communication between job seekers and
                          recruiters
                        </li>
                        <li>Process and fulfill your requests</li>
                        <li>
                          Respond to your inquiries and provide customer service
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Identification and Authentication
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Verify your identity when you log in</li>
                        <li>
                          Authenticate your access to registration and login
                          portals
                        </li>
                        <li>Maintain account security</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Personalization</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          Tailor content and information we send or display to
                          you
                        </li>
                        <li>
                          Offer location customization and personalized help
                        </li>
                        <li>Deliver content around your specific location</li>
                        <li>
                          Identify business locations/listings around your
                          location
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Marketing and Promotional Purposes
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Send news and newsletters, event updates</li>
                        <li>
                          Communicate about new features, offers, events, or
                          products
                        </li>
                        <li>
                          Display advertisements on our site and other websites
                        </li>
                        <li>Sell advertising space on the Service</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Research and Reporting
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          Administer surveys and questionnaires for research
                          purposes
                        </li>
                        <li>Learn more about user needs and service quality</li>
                        <li>
                          Determine effectiveness of communications and
                          campaigns
                        </li>
                        <li>
                          Analyze usage patterns to enhance user experience
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Legal Compliance and Protection
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          Comply with legal obligations and law enforcement
                          requests
                        </li>
                        <li>
                          Exercise or defend our rights or the rights of third
                          parties
                        </li>
                        <li>
                          Investigate and prevent illegal activities and fraud
                        </li>
                        <li>Protect the safety of any person</li>
                        <li>
                          Enforce this Policy and our Terms and Conditions
                        </li>
                      </ul>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>Data Retention:</strong> We will retain your
                        personal information for 36 months after user accounts
                        remain idle or for as long as necessary to fulfill the
                        purposes for which it was collected.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    3. Information Sharing and Third Parties
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                      <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                        WE DO NOT SELL DATA
                      </h4>
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        Your personal information is never sold to third parties
                        for marketing or any other purposes. hired.video will
                        keep collected personal data private and confidential.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        When We Share Information
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          <strong>With Your Consent:</strong> When you apply to
                          jobs or make your profile public
                        </li>
                        <li>
                          <strong>Service Providers:</strong> Third-party
                          services that help us operate our platform (with
                          confidentiality agreements)
                        </li>
                        <li>
                          <strong>Legal Requirements:</strong> When required by
                          law or to protect our rights
                        </li>
                        <li>
                          <strong>Business Transfers:</strong> In the event of a
                          merger or acquisition
                        </li>
                        <li>
                          <strong>Parent Companies:</strong> With parent
                          companies, affiliates, subsidiaries, and related
                          companies
                        </li>
                        <li>
                          <strong>Internal Departments:</strong> Within
                          hired.video departments (administration, marketing,
                          IT)
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Third-Party Services We Use
                      </h4>
                      <div className="space-y-3">
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">YouTube</h5>
                          <p className="text-xs text-muted-foreground">
                            The Site has links to YouTube for videos related to
                            hired.video services.
                            <a
                              href="https://policies.google.com/privacy"
                              className="text-primary hover:underline ml-1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View YouTube Privacy Policy
                            </a>
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">LinkedIn</h5>
                          <p className="text-xs text-muted-foreground">
                            The Site has links to LinkedIn for professional
                            networking features.
                            <a
                              href="https://www.linkedin.com/legal/privacy-policy"
                              className="text-primary hover:underline ml-1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View LinkedIn Privacy Policy
                            </a>
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">
                            Google Analytics
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            We use Google Analytics for website analytics, which
                            collects IP addresses and usage data.
                            <a
                              href="https://policies.google.com/privacy"
                              className="text-primary hover:underline ml-1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View Google Privacy Policy
                            </a>
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">
                            Social Networks
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            We use social networks like Facebook and Instagram
                            with integrated functions. These networks have their
                            own privacy policies over which hired.video has
                            no control.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Additional Disclosure Circumstances
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          <strong>Business Transfer:</strong> If we are
                          acquired, merged, or transfer assets to another
                          company
                        </li>
                        <li>
                          <strong>Compliance with Law:</strong> To comply with
                          legal proceedings, court orders, or subpoenas
                        </li>
                        <li>
                          <strong>Protection of Rights:</strong> To investigate
                          illegal activities, fraud, or threats to safety
                        </li>
                        <li>
                          <strong>Public Safety:</strong> For community safety,
                          national defense, or public health reasons
                        </li>
                        <li>
                          <strong>Aggregate Data:</strong> We may disclose
                          aggregate, anonymized, or de-identified information
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>4. Consent and Legal Basis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                        Your Consent
                      </h4>
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        By providing personal data to hired.video, you
                        declare to accept its processing fully and without
                        reservation. You give your free, express and informed
                        consent to hired.video's use of the data collected
                        for the purposes indicated in this policy.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Legal Basis for Processing
                      </h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          <strong>Contract Performance:</strong> Processing
                          necessary for the contracting of hired.video
                          services
                        </li>
                        <li>
                          <strong>Consent:</strong> Your free, informed and
                          unambiguous consent after reviewing this privacy
                          policy
                        </li>
                        <li>
                          <strong>Legitimate Interest:</strong> When necessary
                          to protect a legitimate interest without infringing
                          your fundamental rights and freedoms
                        </li>
                        <li>
                          <strong>Legal Obligation:</strong> When required by
                          applicable law
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Withdrawing Consent</h4>
                      <p className="text-muted-foreground mb-2">
                        You can oppose the sending of commercial communications
                        (unsubscribe) and stop receiving emails from
                        hired.video by:
                      </p>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Sending an email to info@hired.video</li>
                        <li>
                          Following the unsubscribe instructions in each email
                        </li>
                        <li>
                          Contacting us through the addresses provided in this
                          policy
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>5. Data Security</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      hired.video declares its intention to adopt the
                      necessary technical and organisational measures to ensure
                      the security, integrity and confidentiality of the data in
                      accordance with applicable privacy regulations.
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Encryption of data in transit and at rest</li>
                      <li>
                        Regular security audits and vulnerability assessments
                      </li>
                      <li>Access controls and authentication requirements</li>
                      <li>
                        Secure hosting infrastructure with leading cloud
                        providers
                      </li>
                      <li>Employee training on data protection and privacy</li>
                      <li>
                        Confidentiality and personal data processing agreements
                        with service providers
                      </li>
                    </ul>

                    <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                            Security Limitations and User Responsibilities
                          </h4>
                          <div className="text-amber-700 dark:text-amber-300 text-sm space-y-2">
                            <p>
                              hired.video does not guarantee absolute privacy
                              when using the Site, since the possibility that
                              unauthorized third parties may have knowledge of
                              it cannot be excluded. The user acknowledges that
                              existing technical means are not impregnable and
                              that even with reasonable security precautions,
                              manipulation, destruction and/or loss of
                              information is possible.
                            </p>
                            <p>
                              <strong>User Precautions:</strong> You must take
                              measures to protect your information. Change your
                              password periodically using a combination of
                              letters and numbers, and ensure you are using a
                              secure browser.
                            </p>
                            <p>
                              <strong>Incident Reporting:</strong> Security
                              incidents with significant risk will be reported
                              without delay to the competent control authority,
                              together with corrective and remedial measures.
                            </p>
                            <p>
                              <strong>Limitations:</strong> hired.video is
                              not responsible for loss or deletion of data by
                              users, or damage caused by computer viruses.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>6. Data Retention</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      The data will be destroyed or archived when it is no
                      longer strictly necessary or relevant for the purposes
                      described in this policy.
                    </p>

                    <div>
                      <h4 className="font-medium mb-2">Retention Periods</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          <strong>Active Accounts:</strong> Personal data will
                          be kept for as long as the business relationship is in
                          force
                        </li>
                        <li>
                          <strong>Inactive Accounts:</strong> Data retained for
                          36 months after user accounts remain idle
                        </li>
                        <li>
                          <strong>Legal Requirements:</strong> As long as
                          obligations, indemnities and/or liabilities may arise
                          under the business relationship
                        </li>
                        <li>
                          <strong>Origin Identification:</strong> Information
                          essential to identify the origin of stored data
                          retained for the duration of the client relationship
                        </li>
                      </ul>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>Note:</strong> Retention periods may be extended
                        as required by applicable law or until you request
                        deletion of your data (where legally permissible).
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>7. Your Rights and Choices</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      The data owner user may at any time exercise the rights of
                      access, rectification, cancellation, opposition,
                      limitation of processing, portability, confidentiality and
                      deletion of personal data, in accordance with applicable
                      privacy regulations.
                    </p>

                    <div>
                      <h4 className="font-medium mb-2">
                        How to Exercise Your Rights
                      </h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        The exercise of these rights may be carried out by email
                        to info@hired.video, or by any of the methods
                        provided for in applicable regulations. hired.video
                        may request data necessary to validate your
                        identification.
                      </p>
                    </div>

                    <div className="grid gap-4">
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">
                          Access and Portability
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          Learn if data is being processed, obtain disclosure
                          regarding processing aspects, and obtain a copy of
                          your data. Receive your data in a structured,
                          machine-readable format.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">
                          Rectification and Updates
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          Verify the accuracy of your data and ask for it to be
                          updated or corrected through your account settings or
                          by contacting us.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">
                          Deletion and Erasure
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          Request deletion of your account and personal data.
                          Note: Some data may not be deleted if it would damage
                          legitimate rights of third parties or where legal
                          obligations require retention.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">Consent Withdrawal</h4>
                        <p className="text-muted-foreground text-sm">
                          Withdraw consent at any time where you have previously
                          given consent for processing of your personal data.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">
                          Object to Processing
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          Object to processing of your data if the processing is
                          carried out on a legal basis other than consent.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">
                          Restrict Processing
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          Restrict the processing of your data. In this case, we
                          will not process your data for any purpose other than
                          storing it.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">Lodge a Complaint</h4>
                        <p className="text-muted-foreground text-sm">
                          Bring a claim before your competent data protection
                          authority if you believe your rights have been
                          violated.
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>UK/EEA Residents:</strong> If you are located in
                        the UK or EEA, you have additional data protection
                        rights under applicable law, subject to national or
                        local law exemptions.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>8. US Residents' Privacy Rights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      You may have certain rights regarding our processing of
                      your personal information under applicable local law. If
                      our processing is governed by such laws, this section
                      provides additional information.
                    </p>

                    <div>
                      <h4 className="font-medium mb-2">
                        Marketing Communications
                      </h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        We may send periodic promotional emails to you. You may
                        opt-out by following the opt-out instructions in the
                        email. Please note that it may take up to 10 business
                        days to process opt-out requests. If you opt-out of
                        promotional emails, we may still send you
                        account-related emails.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Your Privacy Rights</h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        Depending on your jurisdiction, you may have the
                        following rights:
                      </p>
                      <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1 ml-4">
                        <li>
                          Right to request access and a copy of your personal
                          information
                        </li>
                        <li>
                          Right to request deletion of your personal information
                        </li>
                        <li>
                          Right to request correction or update of your personal
                          information
                        </li>
                        <li>
                          Right to opt-out of "sales" and "sharing" for
                          cross-context behavioral advertising
                        </li>
                        <li>Right to opt-out of targeted advertising</li>
                        <li>
                          Right to limit use of your sensitive personal
                          information
                        </li>
                        <li>
                          Right to not be unlawfully discriminated against for
                          exercising your rights
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Verification Process</h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        To protect your information, we will confirm your
                        identity before responding to any request. You must
                        provide your name and email. We will ask verification
                        questions based on your previous interactions with us.
                        We will only send verification questions from
                        info@hired.video.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Authorized Agents</h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        You may designate an authorized agent to exercise your
                        rights on your behalf. You must provide written
                        permission to the authorized agent. We may require proof
                        of authorization and may still require you to verify
                        your identity directly.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Appeals Process</h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        If we decline your request, we will inform you of our
                        decision and reasoning. You may appeal our decision by
                        emailing us. Within 60 days of receipt of an appeal, we
                        will inform you of any action taken. If your appeal is
                        denied, you may contact the Attorney General to submit a
                        complaint.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">California Residents</h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        California residents may request information about
                        categories of personal information disclosed to third
                        parties for direct marketing purposes. If you are under
                        18, reside in California, and have a registered account,
                        you have the right to request removal of unwanted data
                        you publicly post.
                      </p>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        <strong>Financial Incentives:</strong> We do not offer
                        financial incentives to collect personal information and
                        will not discriminate against you for exercising your
                        rights. We may offer programs where financial incentives
                        are reasonably related to the value of your data.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>9. Children's Privacy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg">
                      <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                        Protection of Minors
                      </h4>
                      <p className="text-orange-700 dark:text-orange-300 text-sm">
                        At hired.video, we recognize the importance of
                        protecting the privacy of children. Our commitment to
                        safeguarding the personal information of minors is
                        unwavering.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">
                        Collection from Children Under 13
                      </h4>
                      <p className="text-muted-foreground text-sm mb-2">
                        We may collect and process personal information from
                        children under the age of 13, but only in compliance
                        with all applicable laws and regulations, including
                        obtaining parental or guardian consent as required.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Parental Rights</h4>
                      <p className="text-muted-foreground text-sm">
                        If you are a parent or guardian and believe we have
                        collected personal information from your child without
                        appropriate consent, please contact us immediately, and
                        we will take prompt action to address the situation.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>10. Cookies and Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      The user should be aware that, in order to browse the
                      Site, it is not necessary to allow the installation of
                      cookies sent by the Site. This may only be required in
                      relation to certain services.
                    </p>

                    <div>
                      <h4 className="font-medium mb-2">Cookie Management</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          You may delete cookies from your computer hard drive
                        </li>
                        <li>Prevent access through your browser settings</li>
                        <li>
                          Choose the corresponding option when asked about
                          cookie usage
                        </li>
                        <li>
                          Refer to our Cookie Policy for detailed information
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>11. Staff Training</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      The staff of hired.video whose functions are related to
                      the processing of personal data are trained in order to
                      ensure better protection of personal data and the rights
                      of data subjects.
                    </p>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>Ongoing Training:</strong> Our team receives
                        regular training on data protection best practices,
                        privacy regulations, and user rights to ensure your
                        personal information is handled with the highest level
                        of care and compliance.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>12. Links to Third Parties</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                            Third-Party Website Disclaimer
                          </h4>
                          <p className="text-amber-700 dark:text-amber-300 text-sm">
                            The Site may contain links to third party websites
                            whose privacy policies are foreign to
                            hired.video. These linked sites are not related
                            to hired.video, and their existence does not
                            presuppose any suggestion, invitation or
                            recommendation to visit them.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Our Responsibilities</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>
                          hired.video is not responsible for the content, use
                          and activities of linked sites
                        </li>
                        <li>
                          We are not liable for damages derived from information
                          contained in such sites
                        </li>
                        <li>
                          We undertake to prevent links to sites with illegal
                          content
                        </li>
                        <li>
                          Feedback on linked sites helps us improve our services
                          and ensure site integrity
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">User Responsibility</h4>
                      <p className="text-muted-foreground text-sm">
                        Users are responsible for reviewing the privacy policies
                        and terms of service of any third-party websites they
                        visit through links on our Site. We encourage you to be
                        cautious when clicking external links and to verify the
                        legitimacy of third-party sites.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>13. Changes to This Policy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      hired.video may at any time and without prior notice,
                      modify this Privacy Policy. Such modifications will be
                      operative from their publication on the Site or when they
                      are notified to users by any means, whichever occurs
                      first.
                    </p>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>Stay Informed:</strong> The user must keep
                        informed about the terms included here by entering
                        periodically. We recommend checking this policy
                        regularly for updates.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>14. Contact Us</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    If you have questions about this Privacy Policy or how we
                    handle your data, please contact us through the following
                    means:
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium">Primary Contact</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <span>info@hired.video</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <span>hired.video Privacy Team</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Company Details</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                          <strong>Trade name:</strong> hired.video
                        </p>
                        <p>
                          <strong>Controller:</strong> Fix Faster LLC
                        </p>
                        <p>
                          <strong>Address:</strong> Troy, MI
                        </p>
                        <p>
                          <strong>Phone:</strong> 2488250176
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Response Time:</strong> We aim to respond to all
                      privacy inquiries within 72 hours. You may establish
                      direct and effective communication with hired.video by
                      written communication sent to any of the indicated
                      addresses.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>
    </AppShell>
  );
}
