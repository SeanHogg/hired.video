import { apiClient } from "../api-client";

export type UploadAvatarResponse = {
  avatarUrl: string;
};

export type FileUploadResponse = {
  url: string;
};

export async function uploadAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await apiClient.post<UploadAvatarResponse>(
    "/Users/me/avatar",
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
    "/upload/image",
    formData,
  );

  return (response.data as any).url || "";
}
