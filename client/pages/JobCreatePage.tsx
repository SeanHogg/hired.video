import { ArrowLeft, Briefcase, Save, Eye, DollarSign, FileText, CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { jobService, type CreateJob } from "@/lib/services/job-service";


// Job creation form schema
const jobCreateSchema = z.object({
  title: z.string().min(1, "Job title is required").max(100, "Title must be less than 100 characters"),
  company: z.string().min(1, "Company name is required"),
  location: z.string().min(1, "Location is required"),
  description: z.string().min(50, "Description must be at least 50 characters").max(5000, "Description must be less than 5000 characters"),
  requirements: z.string().optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship", "remote"]),
  experienceLevel: z.enum(["entry", "mid", "senior", "executive"]),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  currency: z.string().default("USD"),
  isRemote: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  expiryDate: z.string().optional(),
}).refine((data) => {
  if (data.salaryMin && data.salaryMax) {
    return data.salaryMax >= data.salaryMin;
  }
  return true;
}, {
  message: "Maximum salary must be greater than or equal to minimum salary",
  path: ["salaryMax"],
});

type JobCreateForm = z.infer<typeof jobCreateSchema>;

export default function JobCreatePage() {
  const navigate = useNavigate();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);


  // Form setup
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<JobCreateForm>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: {
      currency: "USD",
      isRemote: false,
      isPublic: true,
      employmentType: "full_time",
      experienceLevel: "mid",
    },
  });

  const watchedValues = watch();

  // Check authentication and role
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (user && user.role !== USER_ROLES.RECRUITER && user.role !== USER_ROLES.EMPLOYER) {
      navigate("/jobs");
      return;
    }
  }, [isAuthenticated, user, navigate]);



  const onSubmit = async (data: JobCreateForm) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Convert form data to CreateJob format
      const jobData: CreateJob = {
        title: data.title,
        company: data.company,
        location: data.location,
        description: data.description,
        requirements: data.requirements ? data.requirements.split('\n').filter(r => r.trim()) : undefined,
        employmentType: data.employmentType,
        experienceLevel: data.experienceLevel,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        currency: data.currency,
        isRemote: data.isRemote,
        isPublic: data.isPublic,
        expiryDate: data.expiryDate,
      };

      await jobService.createJob(jobData);

      setSubmitSuccess(true);

      // Redirect to jobs page after a short delay
      setTimeout(() => {
        navigate("/jobs");
      }, 2000);

    } catch (error: any) {
      console.error("Failed to create job:", error);
      setSubmitError(error.message || "Failed to create job. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading or redirect if not authenticated
  if (!isAuthenticated || !user) {
    return <div>Loading...</div>;
  }

  // Show access denied if not recruiter/employer
  if (user.role !== USER_ROLES.RECRUITER && user.role !== USER_ROLES.EMPLOYER) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
            <p className="text-muted-foreground mb-4">
              Only recruiters and employers can create job postings.
            </p>
            <Button asChild>
              <Link to="/jobs">Back to Jobs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto">
            {/* Back Button */}
            <div className="mb-6">
              <Button asChild variant="outline">
                <Link to="/jobs">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Jobs
                </Link>
              </Button>
            </div>

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Create Job Posting</h1>
              <p className="text-muted-foreground">
                Create a new job posting to attract top talent to your organization
              </p>
            </div>

            {/* Success Message */}
            {submitSuccess && (
              <Alert className="mb-6 border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Job posted successfully! Redirecting to jobs page...
                </AlertDescription>
              </Alert>
            )}

            {/* Error Message */}
            {submitError && (
              <Alert className="mb-6 border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">
                  {submitError}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                  <CardDescription>
                    Provide the essential details about the job position
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Job Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title">Job Title *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Senior Software Engineer"
                      {...register("title")}
                      className={errors.title ? "border-red-500" : ""}
                    />
                    {errors.title && (
                      <p className="text-sm text-red-600">{errors.title.message}</p>
                    )}
                  </div>

                  {/* Company */}
                  <div className="space-y-2">
                    <Label htmlFor="company">Company *</Label>
                    <Input
                      id="company"
                      placeholder="Company name"
                      {...register("company")}
                      className={errors.company ? "border-red-500" : ""}
                    />
                    {errors.company && (
                      <p className="text-sm text-red-600">{errors.company.message}</p>
                    )}
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Input
                      id="location"
                      placeholder="e.g., San Francisco, CA or Remote"
                      {...register("location")}
                      className={errors.location ? "border-red-500" : ""}
                    />
                    {errors.location && (
                      <p className="text-sm text-red-600">{errors.location.message}</p>
                    )}
                  </div>

                  {/* Remote Work Option */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isRemote"
                      checked={watchedValues.isRemote}
                      onCheckedChange={(checked) => setValue("isRemote", !!checked)}
                    />
                    <Label htmlFor="isRemote" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      This is a remote position
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {/* Job Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Job Details
                  </CardTitle>
                  <CardDescription>
                    Describe the role, responsibilities, and requirements
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Employment Type */}
                  <div className="space-y-2">
                    <Label htmlFor="employmentType">Employment Type *</Label>
                    <Select
                      value={watchedValues.employmentType}
                      onValueChange={(value) => setValue("employmentType", value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full-time</SelectItem>
                        <SelectItem value="part_time">Part-time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="internship">Internship</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Experience Level */}
                  <div className="space-y-2">
                    <Label htmlFor="experienceLevel">Experience Level *</Label>
                    <Select
                      value={watchedValues.experienceLevel}
                      onValueChange={(value) => setValue("experienceLevel", value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select experience level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entry">Entry Level</SelectItem>
                        <SelectItem value="mid">Mid Level</SelectItem>
                        <SelectItem value="senior">Senior Level</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Job Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Job Description *</Label>
                    <Textarea
                      id="description"
                      placeholder="Provide a detailed description of the role, responsibilities, and what makes this opportunity exciting..."
                      rows={8}
                      {...register("description")}
                      className={errors.description ? "border-red-500" : ""}
                    />
                    {errors.description && (
                      <p className="text-sm text-red-600">{errors.description.message}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {watchedValues.description?.length || 0} / 5000 characters (minimum 50)
                    </p>
                  </div>

                  {/* Requirements */}
                  <div className="space-y-2">
                    <Label htmlFor="requirements">Requirements (Optional)</Label>
                    <Textarea
                      id="requirements"
                      placeholder="List the key requirements, one per line:&#10;• Bachelor's degree in Computer Science&#10;• 3+ years of React experience&#10;• Strong communication skills"
                      rows={6}
                      {...register("requirements")}
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter each requirement on a new line
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Compensation */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Compensation (Optional)
                  </CardTitle>
                  <CardDescription>
                    Specify salary range to attract qualified candidates
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Minimum Salary */}
                    <div className="space-y-2">
                      <Label htmlFor="salaryMin">Minimum Salary</Label>
                      <Input
                        id="salaryMin"
                        type="number"
                        placeholder="50000"
                        {...register("salaryMin", { valueAsNumber: true })}
                        className={errors.salaryMin ? "border-red-500" : ""}
                      />
                      {errors.salaryMin && (
                        <p className="text-sm text-red-600">{errors.salaryMin.message}</p>
                      )}
                    </div>

                    {/* Maximum Salary */}
                    <div className="space-y-2">
                      <Label htmlFor="salaryMax">Maximum Salary</Label>
                      <Input
                        id="salaryMax"
                        type="number"
                        placeholder="80000"
                        {...register("salaryMax", { valueAsNumber: true })}
                        className={errors.salaryMax ? "border-red-500" : ""}
                      />
                      {errors.salaryMax && (
                        <p className="text-sm text-red-600">{errors.salaryMax.message}</p>
                      )}
                    </div>

                    {/* Currency */}
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select
                        value={watchedValues.currency}
                        onValueChange={(value) => setValue("currency", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="CAD">CAD (C$)</SelectItem>
                          <SelectItem value="AUD">AUD (A$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Job Settings
                  </CardTitle>
                  <CardDescription>
                    Configure visibility and expiration settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Public Visibility */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPublic"
                      checked={watchedValues.isPublic}
                      onCheckedChange={(checked) => setValue("isPublic", !!checked)}
                    />
                    <Label htmlFor="isPublic" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Make this job posting public (visible to all job seekers)
                    </Label>
                  </div>

                  {/* Expiry Date */}
                  <div className="space-y-2">
                    <Label htmlFor="expiryDate">Expiry Date (Optional)</Label>
                    <Input
                      id="expiryDate"
                      type="date"
                      {...register("expiryDate")}
                      min={new Date().toISOString().split('T')[0]}
                    />
                    <p className="text-sm text-muted-foreground">
                      Leave empty for no expiration date
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/jobs")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-w-[120px]"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Post Job
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
