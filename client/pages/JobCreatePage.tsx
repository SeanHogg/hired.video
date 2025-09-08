import {
  ArrowLeft,
  Briefcase,
  Save,
  Eye,
  DollarSign,
  FileText,
  CheckCircle2,
  Upload,
  Download,
  FileSpreadsheet,
  FileImage,
  Plus,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { jobService, type CreateJob } from "@/lib/services/job-service";

// Job creation form schema
const jobCreateSchema = z.object({
  title: z
    .string()
    .min(1, "Job title is required")
    .max(100, "Title must be less than 100 characters"),
  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(5000, "Description must be less than 5000 characters"),
  company: z
    .string()
    .min(1, "Company name is required")
    .max(100, "Company name must be less than 100 characters"),
  location: z
    .string()
    .min(1, "Location is required")
    .max(100, "Location must be less than 100 characters"),
  responsibilities: z.string().optional(),
  requirements: z.string().optional(),
  employmentType: z
    .array(
      z.enum([
        "FullTime",
        "PartTime",
        "Freelance",
        "Contractor",
        "ContractToHire",
        "Temporary",
        "Internship",
      ]),
    )
    .min(1, "At least one employment type is required"),
  seniority: z
    .array(
      z.enum(["Entry", "Junior", "Mid", "Senior", "LeadExecutive", "None"]),
    )
    .min(1, "At least one experience level is required"),
  workSetting: z.enum(["Onsite", "Remote", "Hybrid"]).default("Onsite"),
  isRemote: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  currency: z.string().optional(),
  expirationDate: z.string().optional(),
  status: z.enum(["Draft", "Open", "Closed", "Hired"]).default("Open"),
});

type JobCreateForm = z.infer<typeof jobCreateSchema>;

// Types for different input methods
type JobCreationMethod = "manual" | "excel" | "document";

interface ParsedJobData {
  title: string;
  description: string;
  responsibilities?: string[];
  requirements?: string[];
  employmentType?: string[];
  seniority?: string[];
  workSetting?: string;
  company?: string;
  location?: string;
}

interface ExcelJobRow {
  title: string;
  description: string;
  company?: string;
  location?: string;
  employmentType?: string;
  seniority?: string;
  workSetting?: string;
  responsibilities?: string;
  requirements?: string;
}

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
  const [excelError, setExcelError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [activeMethod, setActiveMethod] = useState<JobCreationMethod>("manual");

  // File upload states
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [parsedJobs, setParsedJobs] = useState<ParsedJobData[]>([]);
  const [selectedJobIndex, setSelectedJobIndex] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Excel preview states
  const [excelJobs, setExcelJobs] = useState<ExcelJobRow[]>([]);
  const [showExcelPreview, setShowExcelPreview] = useState(false);

  // Form setup
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<JobCreateForm>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: {
      employmentType: ["FullTime"],
      seniority: ["Mid"],
      workSetting: "Onsite",
      status: "Open",
      isPublic: true,
      currency: "USD",
    },
  });

  const watchedValues = watch();

  // Check authentication and role
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (
      user &&
      user.role !== USER_ROLES.RECRUITER &&
      user.role !== USER_ROLES.EMPLOYER
    ) {
      navigate("/jobs");
      return;
    }
  }, [isAuthenticated, user, navigate]);

  // File upload handlers
  const handleFileUpload = async (file: File) => {
    setIsProcessingFile(true);
    setUploadedFile(file);

    // Clear all error states
    setSubmitError(null);
    setExcelError(null);
    setDocumentError(null);

    try {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
        // Handle Excel/CSV file
        await handleExcelUpload(file);
      } else if (
        file.name.endsWith(".pdf") ||
        file.name.endsWith(".docx") ||
        file.name.endsWith(".doc")
      ) {
        // Handle document file with AI parsing
        await handleDocumentUpload(file);
      } else {
        throw new Error(
          "Unsupported file type. Please upload Excel (.xlsx, .xls, .csv) or document files (.pdf, .docx, .doc)",
        );
      }
    } catch (error: any) {
      // Set error based on file type
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
        setExcelError(error.message || "Failed to process Excel/CSV file");
      } else {
        setDocumentError(error.message || "Failed to process document file");
      }
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleExcelUpload = async (file: File) => {
    try {
      // Use the job service to create a job from Excel file
      const job = await jobService.createJobFromFile(file);

      // Convert the single job response to our expected format
      const excelJobData = {
        title: job.title || "",
        description: job.description || "",
        company: job.company || "",
        location: job.location || "",
        employmentType: job.employmentType || "FullTime",
        seniority: job.experienceLevel || "Mid",
        workSetting: job.isRemote ? "Remote" : "Onsite",
        responsibilities: "", // Will be extracted from description if needed
        requirements: job.requirements?.join("\n") || "",
      };

      setExcelJobs([excelJobData]);
      setShowExcelPreview(true);
      setActiveMethod("excel");
    } catch (error: any) {
      console.error("Excel upload error:", error);
      throw new Error(error.message || "Failed to parse Excel file");
    }
  };

  const handleDocumentUpload = async (file: File) => {
    try {
      // Use the job service to create a job from document file
      const job = await jobService.createJobFromFile(file);

      // Convert the job response to our expected format
      const parsedJob: ParsedJobData = {
        title: job.title || "",
        description: job.description || "",
        responsibilities: [], // Will be extracted from description if needed
        requirements: job.requirements || [],
        employmentType: [job.employmentType || "FullTime"],
        seniority: [job.experienceLevel || "Mid"],
        workSetting: job.isRemote ? "Remote" : "Onsite",
        company: job.company || "",
        location: job.location || "",
      };

      setParsedJobs([parsedJob]);
      setSelectedJobIndex(0);
      setActiveMethod("document");

      // Pre-fill the form with parsed data
      populateFormWithParsedData(parsedJob);
    } catch (error: any) {
      console.error("Document upload error:", error);
      throw new Error(error.message || "Failed to parse document");
    }
  };

  const populateFormWithParsedData = (jobData: ParsedJobData) => {
    setValue("title", jobData.title);
    setValue("description", jobData.description);
    if (jobData.responsibilities) {
      setValue("responsibilities", jobData.responsibilities.join("\n"));
    }
    if (jobData.requirements) {
      setValue("requirements", jobData.requirements.join("\n"));
    }
    if (jobData.employmentType) {
      setValue("employmentType", jobData.employmentType as any);
    }
    if (jobData.seniority) {
      setValue("seniority", jobData.seniority as any);
    }
    if (jobData.workSetting) {
      setValue("workSetting", jobData.workSetting as any);
    }
    if (jobData.company) {
      setValue("company", jobData.company);
    }
    if (jobData.location) {
      setValue("location", jobData.location);
    }
  };

  const downloadTemplate = () => {
    // Create a CSV template with sample job data
    const csvContent = `Title,Description,Company,Location,Employment Type,Seniority,Work Setting,Responsibilities,Requirements
"Software Engineer","Develop and maintain software applications","Tech Corp","San Francisco, CA","FullTime","Mid","Onsite","Develop features\nWrite tests\nCode reviews","Bachelor's degree\n3+ years experience\nJavaScript knowledge"
"Product Manager","Lead product development and strategy","Innovation Inc","New York, NY","FullTime","Senior","Hybrid","Define product roadmap\nWork with stakeholders\nAnalyze metrics","MBA preferred\n5+ years PM experience\nAgile methodology"`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "job_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const onSubmit = async (data: JobCreateForm) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setExcelError(null);
      setDocumentError(null);

      // Convert form data to CreateJob format
      const jobData: CreateJob = {
        title: data.title,
        description: data.description,
        responsibilities: data.responsibilities
          ? data.responsibilities.split("\n").filter((r) => r.trim())
          : undefined,
        requirements: data.requirements
          ? data.requirements.split("\n").filter((r) => r.trim())
          : undefined,
        employmentType: data.employmentType,
        seniority: data.seniority,
        workSetting: data.workSetting,
        expirationDate: data.expirationDate,
        status: data.status,
      };

      await jobService.createJob(jobData);

      setSubmitSuccess(true);

      // Don't auto-redirect, let user choose next action
    } catch (error: any) {
      console.error("Failed to create job:", error);
      setSubmitError(
        error.message || "Failed to create job. Please try again.",
      );
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
              <br />
              <small className="text-xs">
                Debug: Your role is "{user.role}"
              </small>
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
                Create a new job posting using manual entry, Excel upload, or
                document parsing
              </p>
            </div>

            {/* Input Method Tabs */}
            <Tabs
              value={activeMethod}
              onValueChange={(value) =>
                setActiveMethod(value as JobCreationMethod)
              }
              className="mb-8"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Manual Entry
                </TabsTrigger>
                <TabsTrigger value="excel" className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  File Upload
                </TabsTrigger>
                <TabsTrigger
                  value="document"
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Document Upload
                </TabsTrigger>
              </TabsList>

              {/* Excel Upload Tab */}
              <TabsContent value="excel" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      File Bulk Upload
                    </CardTitle>
                    <CardDescription>
                      Upload an Excel (.xlsx, .xls) or CSV file with multiple job postings. Download
                      our CSV template to get started.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={downloadTemplate}
                        className="flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download CSV Template
                      </Button>
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingFile}
                        className="flex items-center gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        {isProcessingFile
                          ? "Processing..."
                          : "Upload File"}
                      </Button>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                    />

                    {/* Excel Upload Error Message */}
                    {excelError && (
                      <Alert className="border-red-200 bg-red-50">
                        <AlertDescription className="text-red-800">
                          {excelError}
                        </AlertDescription>
                      </Alert>
                    )}

                    {showExcelPreview && excelJobs.length > 0 && (
                      <div className="mt-6">
                        <h4 className="font-semibold mb-4">
                          Preview Jobs ({excelJobs.length} found)
                        </h4>
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {excelJobs.map((job, index) => (
                            <Card key={index} className="p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h5 className="font-medium">{job.title}</h5>
                                  <p className="text-sm text-muted-foreground">
                                    {job.company} • {job.location}
                                  </p>
                                  <p className="text-sm mt-2">
                                    {job.description.substring(0, 100)}...
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    // Populate form with this job data
                                    populateFormWithParsedData(job as any);
                                    setActiveMethod("manual");
                                  }}
                                >
                                  Edit
                                </Button>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Document Upload Tab */}
              <TabsContent value="document" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileImage className="h-5 w-5" />
                      AI Document Parsing
                    </CardTitle>
                    <CardDescription>
                      Upload a PDF or Word document and let AI extract the job
                      details for you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                      <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          Drop your document here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Supports PDF, DOC, and DOCX files
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".pdf,.doc,.docx";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement)
                              .files?.[0];
                            if (file) handleFileUpload(file);
                          };
                          input.click();
                        }}
                        disabled={isProcessingFile}
                      >
                        {isProcessingFile ? "Processing..." : "Choose File"}
                      </Button>
                    </div>

                    {/* Document Upload Error Message */}
                    {documentError && (
                      <Alert className="border-red-200 bg-red-50">
                        <AlertDescription className="text-red-800">
                          {documentError}
                        </AlertDescription>
                      </Alert>
                    )}

                    {parsedJobs.length > 0 && (
                      <div className="mt-6">
                        <h4 className="font-semibold mb-4">Parsed Job Data</h4>
                        <Card className="p-4">
                          <div className="space-y-2">
                            <h5 className="font-medium">
                              {parsedJobs[selectedJobIndex]?.title}
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              {parsedJobs[
                                selectedJobIndex
                              ]?.description.substring(0, 200)}
                              ...
                            </p>
                            <Button
                              size="sm"
                              onClick={() => setActiveMethod("manual")}
                            >
                              Review & Edit
                            </Button>
                          </div>
                        </Card>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Manual Entry Tab */}
              <TabsContent value="manual" className="space-y-6">
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
                          <p className="text-sm text-red-600">
                            {errors.title.message}
                          </p>
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
                          <p className="text-sm text-red-600">
                            {errors.company.message}
                          </p>
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
                          <p className="text-sm text-red-600">
                            {errors.location.message}
                          </p>
                        )}
                      </div>

                      {/* Remote Work Option */}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="isRemote"
                          checked={watchedValues.isRemote}
                          onCheckedChange={(checked) =>
                            setValue("isRemote", !!checked)
                          }
                        />
                        <Label
                          htmlFor="isRemote"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
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
                        <Label htmlFor="employmentType">
                          Employment Type *
                        </Label>
                        <Select
                          value={watchedValues.employmentType?.[0] || ""}
                          onValueChange={(value) =>
                            setValue("employmentType", [value as any])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select employment type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FullTime">Full-time</SelectItem>
                            <SelectItem value="PartTime">Part-time</SelectItem>
                            <SelectItem value="Contractor">Contract</SelectItem>
                            <SelectItem value="Internship">
                              Internship
                            </SelectItem>
                            <SelectItem value="Freelance">Freelance</SelectItem>
                            <SelectItem value="Temporary">Temporary</SelectItem>
                            <SelectItem value="ContractToHire">
                              Contract to Hire
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Work Setting */}
                      <div className="space-y-2">
                        <Label htmlFor="workSetting">Work Setting *</Label>
                        <Select
                          value={watchedValues.workSetting}
                          onValueChange={(value) =>
                            setValue("workSetting", value as any)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select work setting" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Onsite">On-site</SelectItem>
                            <SelectItem value="Remote">Remote</SelectItem>
                            <SelectItem value="Hybrid">Hybrid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Experience Level */}
                      <div className="space-y-2">
                        <Label htmlFor="seniority">Experience Level *</Label>
                        <Select
                          value={watchedValues.seniority?.[0] || ""}
                          onValueChange={(value) =>
                            setValue("seniority", [value as any])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select experience level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Entry">Entry Level</SelectItem>
                            <SelectItem value="Junior">Junior Level</SelectItem>
                            <SelectItem value="Mid">Mid Level</SelectItem>
                            <SelectItem value="Senior">Senior Level</SelectItem>
                            <SelectItem value="LeadExecutive">
                              Lead/Executive
                            </SelectItem>
                            <SelectItem value="None">Not Specified</SelectItem>
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
                          <p className="text-sm text-red-600">
                            {errors.description.message}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {watchedValues.description?.length || 0} / 5000
                          characters (minimum 50)
                        </p>
                      </div>

                      {/* Requirements */}
                      <div className="space-y-2">
                        <Label htmlFor="requirements">
                          Requirements (Optional)
                        </Label>
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
                            <p className="text-sm text-red-600">
                              {errors.salaryMin.message}
                            </p>
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
                            <p className="text-sm text-red-600">
                              {errors.salaryMax.message}
                            </p>
                          )}
                        </div>

                        {/* Currency */}
                        <div className="space-y-2">
                          <Label htmlFor="currency">Currency</Label>
                          <Select
                            value={watchedValues.currency}
                            onValueChange={(value) =>
                              setValue("currency", value)
                            }
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
                          onCheckedChange={(checked) =>
                            setValue("isPublic", !!checked)
                          }
                        />
                        <Label
                          htmlFor="isPublic"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Make this job posting public (visible to all job
                          seekers)
                        </Label>
                      </div>

                      {/* Expiry Date */}
                      <div className="space-y-2">
                        <Label htmlFor="expirationDate">
                          Expiry Date (Optional)
                        </Label>
                        <Input
                          id="expirationDate"
                          type="date"
                          {...register("expirationDate")}
                          min={new Date().toISOString().split("T")[0]}
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

                  {/* Success Actions */}
                  {submitSuccess && (
                    <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSubmitSuccess(false);
                          setSubmitError(null);
                          setExcelError(null);
                          setDocumentError(null);
                          reset();
                          setActiveMethod("manual");
                          setUploadedFile(null);
                          setParsedJobs([]);
                          setExcelJobs([]);
                          setShowExcelPreview(false);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Another Job
                      </Button>
                      <Button onClick={() => navigate("/jobs")}>
                        View All Jobs
                      </Button>
                    </div>
                  )}
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
