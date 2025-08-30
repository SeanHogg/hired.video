import {
  Mail,
  Phone,
  MapPin,
  MessageCircle,
  Send,
  Clock,
  Users,
  Heart,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

// Declare HubSpot global variable
declare global {
  interface Window {
    hbspt: any;
  }
}

export default function Contact() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // SEO for contact page
  useSEO(location.pathname);
  const { isAuthenticated } = useAuth();
  const [hubspotLoaded, setHubspotLoaded] = useState(false);

  // Load HubSpot form script
  useEffect(() => {
    // Check if HubSpot script is already loaded
    if (window.hbspt) {
      createForm();
      return;
    }

    // Create and load HubSpot script
    const script = document.createElement('script');
    script.src = '//js-na2.hsforms.net/forms/embed/v2.js';
    script.charset = 'utf-8';
    script.type = 'text/javascript';
    script.onload = () => {
      createForm();
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove script when component unmounts
      const existingScript = document.querySelector('script[src="//js-na2.hsforms.net/forms/embed/v2.js"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  const createForm = () => {
    if (window.hbspt && window.hbspt.forms) {
      window.hbspt.forms.create({
        portalId: "242403512",
        formId: "59fc922d-e44c-410a-8579-76ccd3a1fe33",
        region: "na2",
        target: '#hubspot-form'
      });
      setHubspotLoaded(true);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "Email Us",
      description: "Get in touch via email",
      value: "info@myvideoresu.me",
      action: "mailto:info@myvideoresu.me",
    },
    {
      icon: MessageCircle,
      title: "Live Chat",
      description: "Chat with our support team",
      value: "Available 24/7",
      action: "#",
    },
    {
      icon: Clock,
      title: "Response Time",
      description: "We typically respond within",
      value: "24 hours",
      action: null,
    },
  ];

  const faqs = [
    {
      question: "How do I create a video resume?",
      answer: "Simply sign up for an account, upload your existing resume, and use our AI-powered tools to create a compelling video resume that showcases your skills and personality."
    },
    {
      question: "Is MyVideoResu.me free to use?",
      answer: "We offer both free and premium plans. Our free plan includes basic video resume creation, while premium plans offer advanced features like AI optimization and priority support."
    },
    {
      question: "How do employers find my video resume?",
      answer: "Employers can discover your profile through our platform's search and matching algorithms, or you can share your video resume directly via a custom link."
    },
    {
      question: "What video formats are supported?",
      answer: "We support all major video formats including MP4, MOV, and AVI. Our platform automatically optimizes your videos for the best viewing experience across all devices."
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          {/* Hero Section */}
          <section className="bg-gradient-to-br from-primary/5 via-background to-secondary/5 py-20">
            <div className="max-w-6xl mx-auto px-6">
              <div className="text-center max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Get in Touch
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                  Have questions about MyVideoResu.me? We're here to help you succeed in your career journey.
                  Reach out to our team and we'll get back to you as soon as possible.
                </p>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-6">
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                {contactInfo.map((info, index) => (
                  <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                        <info.icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{info.title}</CardTitle>
                      <CardDescription>{info.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold text-lg mb-4">{info.value}</p>
                      {info.action && info.action !== "#" && (
                        <Button asChild variant="outline">
                          <a href={info.action}>
                            Contact Us
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {info.action === "#" && (
                        <Button variant="outline" onClick={() => {
                          // Scroll to contact form
                          document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' });
                        }}>
                          Start Chat
                          <MessageCircle className="ml-2 h-4 w-4" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Contact Form Section */}
          <section id="contact-form" className="py-16 bg-muted/30">
            <div className="max-w-4xl mx-auto px-6">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">Send Us a Message</h2>
                <p className="text-lg text-muted-foreground">
                  Fill out the form below and we'll get back to you within 24 hours.
                </p>
              </div>

              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle className="text-center">Contact Form</CardTitle>
                  <CardDescription className="text-center">
                    We'd love to hear from you. Send us a message and we'll respond as soon as possible.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* HubSpot Form Container */}
                  <div id="hubspot-form" className="min-h-[400px] flex items-center justify-center">
                    {!hubspotLoaded && (
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading contact form...</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* FAQ Section */}
          <section className="py-16">
            <div className="max-w-4xl mx-auto px-6">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
                <p className="text-lg text-muted-foreground">
                  Find answers to common questions about MyVideoResu.me
                </p>
              </div>

              <div className="space-y-6">
                {faqs.map((faq, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        {faq.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground ml-8">{faq.answer}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        </div>

        <Footer />
      </div>
    </div>
  );
}
