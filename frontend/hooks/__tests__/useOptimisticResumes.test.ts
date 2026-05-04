import { describe, it, expect } from 'vitest';
import { useOptimisticResumes } from '@/hooks/useOptimisticResumes';
import { renderHook, act } from '@testing-library/react';
import type { ResumeWithOwnership, MasterResumeGroup } from '@/lib/services/resume-service';

const mkResume = (id: string, privacy: 'public' | 'recruiter_only' | 'private' = 'private'): ResumeWithOwnership => ({
  id,
  userId: 'u',
  title: id,
  slug: id,
  status: 'draft',
  privacy,
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
  summary: '',
  ownership: 'owned',
});

const mkGroup = (masterId: string): MasterResumeGroup => ({
  masterResume: {
    id: masterId,
    userId: 'u',
    title: 'm',
    slug: 'm',
    content: {
      work: [], volunteer: [], education: [], awards: [], certificates: [],
      publications: [], skills: [], languages: [], interests: [],
      references: [], projects: [],
    },
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
  },
  variations: [],
});

describe('useOptimisticResumes.setPrivacyOptimistic', () => {
  it('enforces exclusivity: setting one public demotes others to private', () => {
    const initial = [mkResume('r1', 'private'), mkResume('r2', 'public')];
    const { result } = renderHook(() => useOptimisticResumes(initial, [mkGroup('r1')]));

    act(() => result.current[1].setPrivacyOptimistic('r1', 'public'));

    const state = result.current[0];
    const r1 = state.resumes.find(r => r.id === 'r1');
    const r2 = state.resumes.find(r => r.id === 'r2');
    expect(r1.privacy).toBe('public');
    expect(r2.privacy).toBe('private');
  });
});

