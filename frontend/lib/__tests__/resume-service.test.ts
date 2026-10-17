import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resumeService, type ResumeWithOwnership, type MasterResumeGroup } from '@/lib/services/resume-service';
import * as apiClientModule from '@/lib/api-client';

// Minimal helper to build a MasterResumeGroup using the clean Resume shape
// that the backend now returns (shared/resume.ts).
const mkGroup = (id: string, opts?: Partial<MasterResumeGroup['masterResume']>) => ({
  masterResume: {
    id,
    userId: 'u1',
    title: `Master ${id}`,
    slug: `master-${id}`,
    status: 'draft',
    privacy: 'private',
    isMaster: true,
    isActive: false,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    scores: null,
    viewCount: 1,
    isOwner: true,
    isWatched: false,
    content: {
      basics: { name: `Name ${id}`, label: `Label ${id}`, summary: `Summary ${id}` },
      work: [],
      education: [],
      volunteer: [],
      awards: [],
      certificates: [],
      publications: [],
      skills: [],
      languages: [],
      interests: [],
      references: [],
      projects: [],
      metaData: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
      patch: vi.fn(),
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
  patch: ReturnType<typeof vi.fn>;
};

describe('resumeService.getResumesForDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns owned/withOwnership when available', async () => {
    const owned: ResumeWithOwnership[] = [
      {
        id: 'r1',
        userId: 'u1',
        title: 'T',
        slug: 'r1',
        status: 'draft',
        privacy: 'private',
        isMaster: true,
        isActive: false,
        parentId: null,
        diffPercent: null,
        templateId: null,
        metaResumeId: null,
        sentimentScore: null,
        scores: null,
        viewCount: 0,
        isOwner: true,
        isWatched: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        headline: '',
        summary: 'S',
        hasCoverLetter: false,
        ownership: 'owned',
      },
    ];

    // withOwnership endpoint
    apiClient.get.mockResolvedValueOnce({ data: owned });
    // masterGroups endpoint (unused because owned exists)
    apiClient.get.mockResolvedValueOnce({ data: [mkGroup('m1')] });

    const result = await resumeService.getResumesForDisplay();
    expect(result).toEqual(owned);
    expect(apiClient.get).toHaveBeenCalledWith('/api/resumes?owner=me&include=ownership', expect.anything());
    expect(apiClient.get).toHaveBeenCalledWith('/api/resumes?owner=me&view=groups', expect.anything());
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

  it('PATCHes the résumé state and returns true', async () => {
    apiClient.patch.mockResolvedValueOnce({ data: mkGroup('r1').masterResume });
    const ok = await resumeService.setResumePrivacy('r1', 'public');
    expect(ok).toBe(true);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/resumes/r1', { privacy: 'public' }, expect.anything());
  });
});

