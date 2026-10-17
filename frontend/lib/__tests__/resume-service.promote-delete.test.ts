import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resumeService } from '@/lib/services/resume-service';
import * as apiClientModule from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClientModule>('@@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      getRaw: vi.fn(),
      requestRaw: vi.fn(),
    },
  } as unknown as typeof apiClientModule;
});

const apiClient = (apiClientModule as any).apiClient as {
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('resumeService promote/delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('promoteVariantToMaster calls API and returns boolean', async () => {
    apiClient.patch.mockResolvedValueOnce({ data: { id: 'v1' } });
    const ok = await resumeService.promoteVariantToMaster('v1');
    expect(ok).toBe(true);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/resumes/v1', { isMaster: true, parentId: null }, expect.anything());
  });

  it('deleteResume calls API and resolves (void)', async () => {
    apiClient.delete.mockResolvedValueOnce({ data: true });
    await expect(resumeService.deleteResume('r1')).resolves.toBeUndefined();
    expect(apiClient.delete).toHaveBeenCalledWith('/api/resumes/r1');
  });
});

