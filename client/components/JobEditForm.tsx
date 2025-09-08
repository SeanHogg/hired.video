import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Types
interface JobFormData {
  id?: string;
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  atsApplyUrl?: string;
  salary?: number;
  bonus?: number;
  equity?: number;
  employmentType: number[];
  workSetting: number;
  seniority?: number;
  industry: number[];
  hiringTarget?: number;
  goLiveDate?: string;
  expirationDate?: string;
  status?: number;
  privacy_ShowJob: number;
}

interface JobEditFormProps {
  job?: JobFormData;
  onSave: (jobData: JobFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

// Enums (should match backend)
const EmploymentType = {
  FullTime: 0,
  PartTime: 1,
  Contract: 2,
  Internship: 3,
  Temporary: 4,
  Freelance: 5,
};

const WorkSetting = {
  OnSite: 0,
  Remote: 1,
  Hybrid: 2,
};

const DisplayPrivacy = {
  ToPublic: 0,
  ToRecruiters: 1,
  ToConnections: 2,
  ToSelf: 10,
};

const JobStatus = {
  Draft: 0,
  Open: 1,
  Closed: 2,
  Paused: 3,
};

export default function JobEditForm({
  job,
  onSave,
  onCancel,
  loading = false,
}: JobEditFormProps) {
  const [formData, setFormData] = useState<JobFormData>({
    title: "",
    description: "",
    requirements: [],
    responsibilities: [],
    atsApplyUrl: "",
    salary: undefined,
    bonus: undefined,
    equity: undefined,
    employmentType: [EmploymentType.FullTime],
    workSetting: WorkSetting.OnSite,
    seniority: undefined,
    industry: [],
    hiringTarget: undefined,
    goLiveDate: "",
    expirationDate: "",
    status: JobStatus.Draft,
    privacy_ShowJob: DisplayPrivacy.ToPublic,
  });

  const [newRequirement, setNewRequirement] = useState("");
  const [newResponsibility, setNewResponsibility] = useState("");

  // Initialize form with job data
  useEffect(() => {
    if (job) {
      setFormData({
        id: job.id,
        title: job.title || "",
        description: job.description || "",
        requirements: job.requirements || [],
        responsibilities: job.responsibilities || [],
        atsApplyUrl: job.atsApplyUrl || "",
        salary: job.salary,
        bonus: job.bonus,
        equity: job.equity,
        employmentType: job.employmentType || [EmploymentType.FullTime],
        workSetting: job.workSetting ?? WorkSetting.OnSite,
        seniority: job.seniority,
        industry: job.industry || [],
        hiringTarget: job.hiringTarget,
        goLiveDate: job.goLiveDate
          ? new Date(job.goLiveDate).toISOString().split("T")[0]
          : "",
        expirationDate: job.expirationDate
          ? new Date(job.expirationDate).toISOString().split("T")[0]
          : "",
        status: job.status ?? JobStatus.Draft,
        privacy_ShowJob: job.privacy_ShowJob ?? DisplayPrivacy.ToPublic,
      });
    }
  }, [job]);

  const handleInputChange = (
    field: keyof JobFormData,
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const addRequirement = () => {
    if (newRequirement.trim()) {
      setFormData((prev) => ({
        ...prev,
        requirements: [...prev.requirements, newRequirement.trim()],
      }));
      setNewRequirement("");
    }
  };

  const removeRequirement = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      requirements: prev.requirements.filter((_, i) => i !== index),
    }));
  };

  const addResponsibility = () => {
    if (newResponsibility.trim()) {
      setFormData((prev) => ({
        ...prev,
        responsibilities: [...prev.responsibilities, newResponsibility.trim()],
      }));
      setNewResponsibility("");
    }
  };

  const removeResponsibility = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      responsibilities: prev.responsibilities.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Job title is required");
      return;
    }

    if (!formData.description.trim()) {
      toast.error("Job description is required");
      return;
    }

    try {
      await onSave(formData);
    } catch (error) {
      console.error("Error saving job:", error);
      toast.error("Failed to save job");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Enter the basic details for this job posting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Job Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Job Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Describe the role, company, and what makes this opportunity unique..."
              rows={6}
              required
            />
          </div>

          <div>
            <Label htmlFor="atsApplyUrl">Application URL</Label>
            <Input
              id="atsApplyUrl"
              type="url"
              value={formData.atsApplyUrl}
              onChange={(e) => handleInputChange("atsApplyUrl", e.target.value)}
              placeholder="https://company.com/apply"
            />
          </div>
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>
            List the skills, experience, and qualifications needed for this role
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newRequirement}
              onChange={(e) => setNewRequirement(e.target.value)}
              placeholder="Add a requirement..."
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addRequirement())
              }
            />
            <Button type="button" onClick={addRequirement} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {formData.requirements.map((req, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {req}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeRequirement(index)}
                />
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Responsibilities */}
      <Card>
        <CardHeader>
          <CardTitle>Responsibilities</CardTitle>
          <CardDescription>
            Outline the key responsibilities and duties for this position
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newResponsibility}
              onChange={(e) => setNewResponsibility(e.target.value)}
              placeholder="Add a responsibility..."
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addResponsibility())
              }
            />
            <Button type="button" onClick={addResponsibility} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {formData.responsibilities.map((resp, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {resp}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeResponsibility(index)}
                />
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Job Details */}
      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            Configure employment type, work setting, and other job specifics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="workSetting">Work Setting</Label>
              <Select
                value={formData.workSetting.toString()}
                onValueChange={(value) =>
                  handleInputChange("workSetting", parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">On-site</SelectItem>
                  <SelectItem value="1">Remote</SelectItem>
                  <SelectItem value="2">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status?.toString() || "0"}
                onValueChange={(value) =>
                  handleInputChange("status", parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Draft</SelectItem>
                  <SelectItem value="1">Open</SelectItem>
                  <SelectItem value="2">Closed</SelectItem>
                  <SelectItem value="3">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="salary">Salary</Label>
              <Input
                id="salary"
                type="number"
                value={formData.salary || ""}
                onChange={(e) =>
                  handleInputChange(
                    "salary",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                placeholder="Annual salary"
              />
            </div>

            <div>
              <Label htmlFor="bonus">Bonus</Label>
              <Input
                id="bonus"
                type="number"
                value={formData.bonus || ""}
                onChange={(e) =>
                  handleInputChange(
                    "bonus",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                placeholder="Annual bonus"
              />
            </div>

            <div>
              <Label htmlFor="equity">Equity %</Label>
              <Input
                id="equity"
                type="number"
                step="0.01"
                value={formData.equity || ""}
                onChange={(e) =>
                  handleInputChange(
                    "equity",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="Equity percentage"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Save Job
        </Button>
      </div>
    </form>
  );
}
