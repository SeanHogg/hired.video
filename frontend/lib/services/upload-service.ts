import { z } from "zod";
import {
  UPLOADED_ASSET_KINDS,
  type UploadedAssetKind,
  type UploadedAssetPage,
} from "@shared/uploaded-assets";
import { apiClient } from "../api-client";
import { buildApiUrl } from "../api/base-url";
import { standardAuthHeaders } from "../api/auth-token";

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
// 32MB raised from 5MB per #949 — a flattened DrawingStage at 4096²
// regularly exceeded 16MB and the old cap silently rejected. 32MB
// covers most 8K JPEG / 4K PNG exports + leaves headroom for
// PSD-converted uploads when #940's Phase 2 PSD import lands.
const MAX_IMAGE_SIZE = 32 * 1024 * 1024;

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
 * Validate an image file before upload. Accepts `Blob` (the wider type)
 * so callers that produce raw blobs from `canvas.toBlob()` (e.g. the
 * DrawingStage "Save to library" path) can share the same validation
 * as picker uploads. `File` extends `Blob` so existing callers are
 * unaffected.
 */
export function validateImageFile(file: Blob): { valid: boolean; error?: string } {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid image format. Supported formats: JPG, PNG, GIF, WebP",
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
 * Upload an image to the user's R2 namespace. Accepts `Blob` (the
 * wider type) so DOM-canvas exports (DrawingStage "Save to library"
 * action) and picker file uploads share a single port. When `filename`
 * is supplied the multipart part carries it (useful for human-readable
 * R2 metadata + future download UX); otherwise FormData picks a
 * default. Returns the durable CDN URL.
 */
export async function uploadImage(
  file: Blob,
  filename?: string,
): Promise<string> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const formData = new FormData();
  if (filename) formData.append("file", file, filename);
  else formData.append("file", file);

  const response = await apiClient.post<FileUploadResponse>(
    "/api/upload/image",
    formData,
  );

  return response.data.url || "";
}

const UploadedAssetItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  url: z.string(),
  kind: z.enum(UPLOADED_ASSET_KINDS),
  contentType: z.string(),
  sizeBytes: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  sourceProjectId: z.string().nullable(),
  uploadedAt: z.string(),
});

const UploadedAssetPageSchema = z.object({
  items: z.array(UploadedAssetItemSchema),
  nextCursor: z.string().nullable(),
});

/**
 * One page of the signed-in user's media library (#950), newest first —
 * `GET /api/upload/images`, backed by `uploaded_assets` (#733). Pass the
 * previous page's `nextCursor` to continue; `nextCursor: null` = last page.
 * Powers the MediaPicker "Library" tab (closed-loop interop, #933).
 */
export async function listMyAssetPage(
  opts: { cursor?: string | null; limit?: number; kind?: "images" | UploadedAssetKind } = {},
): Promise<UploadedAssetPage> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.kind) params.set("kind", opts.kind);
  const qs = params.toString();
  const { data } = await apiClient.get(`/api/upload/images${qs ? `?${qs}` : ""}`, UploadedAssetPageSchema);
  // Without strictNullChecks zod infers nullable fields as optional keys, so
  // spell the nulls out to meet the shared UploadedAssetItem contract.
  return {
    nextCursor: data.nextCursor ?? null,
    items: data.items.map((item) => ({
      ...item,
      width: item.width ?? null,
      height: item.height ?? null,
      sourceProjectId: item.sourceProjectId ?? null,
    })),
  };
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

      // XHR (not apiClient) for upload progress events; URL + auth headers
      // (Bearer + X-Emulation-Token) come from the same SSoT as apiClient.
      const url = buildApiUrl("/api/upload/video");
      xhr.open("POST", url);
      for (const [name, value] of Object.entries(standardAuthHeaders(url))) {
        xhr.setRequestHeader(name, value);
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
    z.object({ url: z.string() }),
  );

  return response.data.url;
}
