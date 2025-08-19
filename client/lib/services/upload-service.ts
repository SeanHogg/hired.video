import { apiClient } from "../api-client";

export type UploadAvatarResponse = {
  avatarUrl: string;
};

export async function uploadAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await apiClient.post<UploadAvatarResponse>(
    "/Users/me/avatar",
    formData
  );

  return (response.data as any).avatarUrl || (response.data as any).url || "";
}

