import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resumeService, type ResumeWithOwnership, type MasterResumeGroup } from '@/lib/services/resume-service';
import * as apiClientModule from '@/lib/api-client';

// Minimal helper to build MasterResumeGroup
const mkGroup = (id: string, opts?: Partial<MasterResumeGroup['masterResume']>) => ({
  masterResume: {
    id,
    userId: 'u1',
    name: `Master ${id}`,
    slug: `master-${id}`,
    description: null,
    isPrimaryDefault: false,
    sentimentScore: 0,
    isWatched: false,
    privacy_ShowResume: 10,
    privacy_ShowContactDetails: 10,
    industry: 0,
    employmentType: [],
    paySchedule: 0,
    minimumSalary: 0,
    resumeType: 0,
    resumeSerialized: JSON.stringify({ Basics: { Summary: `Summary ${id}` }, basics: { summary: `Summary ${id}` } }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    views: 1,
    isMaster: true,
    isActive: false,
    parentId: null,
    creationDateTime: new Date().toISOString(),
    updateDateTime: new Date().toISOString(),
    metaResume: { basics: { name: `Name ${id}`, label: `Label ${id}` } },
    ...opts,
  },
  variations: [],
});

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClientModule>('@@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      getRaw: vi.fn(),
      requestRaw: vi.fn(),
    },
  } as unknown as typeof apiClientModule;
});

const apiClient = (apiClientModule as any).apiClient as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe('resumeService.getResumesForDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns owned/withOwnership when available', async () => {
    const owned: ResumeWithOwnership[] = [
      {
        id: 'r1', slug: 'r1', name: 'R1', privacy: 'private', isMaster: true, isActive: false, parentId: undefined,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), views: 0, summary: 'S', title: 'T', userId: 'u1', ownership: 'owned',
      },
    ];

    // withOwnership endpoint
    apiClient.get.mockResolvedValueOnce({ data: owned });
    // masterGroups endpoint (unused because owned exists)
    apiClient.get.mockResolvedValueOnce({ data: [mkGroup('m1')] });

    const result = await resumeService.getResumesForDisplay();
    expect(result).toEqual(owned);
  });

  it('falls back to flattening master groups when withOwnership is empty', async () => {
    // withOwnership empty
    apiClient.get.mockResolvedValueOnce({ data: [] });
    // masterGroups
    apiClient.get.mockResolvedValueOnce({ data: [mkGroup('m1')] });

    const result = await resumeService.getResumesForDisplay();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'm1', ownership: 'owned', summary: expect.stringContaining('Summary') });
  });
});

describe('resumeService.setResumePrivacy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs to backend and returns true', async () => {
    apiClient.post.mockResolvedValueOnce({ data: true });
    const ok = await resumeService.setResumePrivacy('r1', 'public');
    expect(ok).toBe(true);
    expect(apiClient.post).toHaveBeenCalledWith('/api/Resume/r1/setPrivacy', { privacy: 'public' }, expect.anything());
  });
});

