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
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { TIER_NAME } from "@shared/tier-copy";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

const BURNRATE_EMBED_SRC =
  "https://api.burnrateos.com/api/embed/burnrate.js?embed=525cfddf-5fe2-4c6f-8787-66ee224c7135";

export default function Contact() {
  const location = useLocation();
  // SEO for contact page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Contact", url: "/contact" }]);
  const { isAuthenticated } = useAuth();

  // Load BurnRateOS embed script
  useEffect(() => {
    if (document.querySelector(`script[src="${BURNRATE_EMBED_SRC}"]`)) {
      return;
    }
    const script = document.createElement("script");
    script.src = BURNRATE_EMBED_SRC;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const contactInfo = [
    {
      icon: Mail,
      title: "Email Us",
      description: "Get in touch via email",
      value: "info@hired.video",
      action: "mailto:info@hired.video",
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
      answer:
        "Simply sign up for an account, upload your existing resume, and use our AI-powered tools to create a compelling video resume that showcases your skills and personality.",
    },
    {
      question: "Is hired.video free to use?",
      answer:
        `We offer both ${TIER_NAME.free} and ${TIER_NAME.pro} plans. Our ${TIER_NAME.free} plan includes basic video resume creation, while ${TIER_NAME.pro} plans offer advanced features like AI optimization and priority support.`,
    },
    {
      question: "How do employers find my video resume?",
      answer:
        "Employers can discover your profile through our platform's search and matching algorithms, or you can share your video resume directly via a custom link.",
    },
    {
      question: "What video formats are supported?",
      answer:
        "We support all major video formats including MP4, MOV, and AVI. Our platform automatically optimizes your videos for the best viewing experience across all devices.",
    },
  ];

  return (
    <AppShell bgClassName="bg-background">
<div>
          {/* Hero Section */}
          <section className="bg-gradient-to-br from-primary/5 via-background to-secondary/5 py-20">
            <div className="px-6">
              <div className="text-center max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Get in Touch
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                  Have questions about hired.video? We're here to help you
                  succeed in your career journey. Reach out to our team and
                  we'll get back to you as soon as possible.
                </p>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section className="py-16">
            <div className="px-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                {contactInfo.map((info, index) => (
                  <Card
                    key={index}
                    className="text-center hover:shadow-lg transition-shadow"
                  >
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
                        <Button
                          variant="outline"
                          onClick={() => {
                            // Scroll to contact form
                            document
                              .getElementById("contact-form")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
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
            <div className="px-6">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">Send Us a Message</h2>
                <p className="text-lg text-muted-foreground">
                  Fill out the form below and we'll get back to you within 24
                  hours.
                </p>
              </div>

              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle className="text-center">Contact Form</CardTitle>
                  <CardDescription className="text-center">
                    We'd love to hear from you. Send us a message and we'll
                    respond as soon as possible.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    data-bro-form="908f62d0-c5c3-418a-b884-73d31fcd589b"
                    className="min-h-[400px]"
                  />
                </CardContent>
              </Card>
            </div>
          </section>

          {/* FAQ Section */}
          <MarketingFAQ
            schemaId="contact"
            subheading="Quick answers before you reach out — most common questions are handled here."
            items={faqs}
          />
        </div>
</AppShell>
  );
}
