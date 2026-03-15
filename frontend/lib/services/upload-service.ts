import { apiClient } from "../api-client";

export type UploadAvatarResponse = {
  avatarUrl: string;
};

export type FileUploadResponse = {
  url: string;
};

export type VideoUploadResponse = {
  url: string;
  fileName: string;
  size: number;
  metadata: {
    fileName: string;
    size: number;
    contentType: string;
    uploadedAt: string;
  };
};

export type UploadProgressCallback = (progress: number) => void;

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validate a video file before upload
 */
export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid video format. Supported formats: MP4, WebM, MOV, AVI`,
    };
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: `Video size exceeds limit (${MAX_VIDEO_SIZE / (1024 * 1024)}MB)`,
    };
  }

  return { valid: true };
}

/**
 * Validate an image file before upload
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid image format. Supported formats: JPG, PNG, GIF",
    };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image size exceeds limit (${MAX_IMAGE_SIZE / (1024 * 1024)}MB)`,
    };
  }

  return { valid: true };
}

export async function uploadAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await apiClient.post<UploadAvatarResponse>(
    "/api/upload/image",
    formData,
  );

  return (response.data as any).avatarUrl || (response.data as any).url || "";
}

/**
 * Upload a company logo image
 */
export async function uploadCompanyLogo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<FileUploadResponse>(
    "/api/upload/image",
    formData,
  );

  // Backend returns full URL (e.g., https://api.hired.video/uploads/filename.png)
  return response.data.url || "";
}

/**
 * Upload an image file
 */
export async function uploadImage(file: File): Promise<string> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<FileUploadResponse>(
    "/api/upload/image",
    formData,
  );

  return response.data.url || "";
}

/**
 * Upload a video file with optional progress tracking
 * Uses native fetch with XMLHttpRequest for progress support
 */
export async function uploadVideo(
  file: File,
  onProgress?: UploadProgressCallback
): Promise<VideoUploadResponse> {
  const validation = validateVideoFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const formData = new FormData();
  formData.append("file", file);

  // If progress tracking is needed, use XMLHttpRequest
  if (onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded * 100) / event.total);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            resolve(data.data);
          } else {
            reject(new Error(data.error?.message || data.message || "Failed to upload video"));
          }
        } catch {
          reject(new Error("Failed to parse server response"));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during upload"));
      };

      // Get the base URL from apiClient configuration
      const baseUrl = import.meta.env.VITE_API_URL ||
                      import.meta.env.VITE_API_BASE_URL ||
                      "https://api.hired.video";

      xhr.open("POST", `${baseUrl}/api/upload/video`);

      // Add auth token if available
      const token = localStorage.getItem("auth_token");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      // Do NOT set Content-Type - let the browser set it with the boundary

      xhr.send(formData);
    });
  }

  // Without progress tracking, use the apiClient
  const response = await apiClient.post<VideoUploadResponse>(
    "/api/upload/video",
    formData,
  );

  return response.data;
}

/**
 * Upload a generic file
 */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<FileUploadResponse>(
    "/api/upload/single",
    formData,
  );

  return response.data.url || "";
}
