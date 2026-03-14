import { describe, it, expect } from 'vitest';
import { useOptimisticResumes } from '@/hooks/useOptimisticResumes';
import { renderHook, act } from '@testing-library/react';
import type { ResumeWithOwnership, MasterResumeGroup } from '@/lib/services/resume-service';

const mkResume = (id: string, privacy: 'public' | 'recruiter_only' | 'private' = 'private'): ResumeWithOwnership => ({
  id, slug: id, name: id, privacy, isMaster: true, isActive: false, parentId: undefined,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), views: 0, summary: '', title: '', userId: 'u', ownership: 'owned'
});

const mkGroup = (masterId: string): MasterResumeGroup => ({
  masterResume: {
    id: masterId,
    userId: 'u',
    name: 'm',
    slug: 'm',
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
    resumeSerialized: '{}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    views: 0,
    isMaster: true,
    isActive: false,
    parentId: null,
    creationDateTime: new Date().toISOString(),
    updateDateTime: new Date().toISOString(),
    metaResume: null,
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

