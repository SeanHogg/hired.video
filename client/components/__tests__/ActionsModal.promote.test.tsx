import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionsModal from '@/components/ActionsModal';

const mkItem = (over: Partial<any> = {}) => ({
  id: 'v1',
  type: 'resume',
  userId: 'u1',
  name: 'Variant 1',
  parentId: 'm1', // indicates a variant
  privacy_ShowResume: 10,
  ...over,
});

describe('ActionsModal - Promote to Master visibility', () => {
  it('shows Promote to Master for variant resumes', () => {
    const onPromote = vi.fn();
    render(
      <ActionsModal
        isOpen
        onClose={() => {}}
        item={mkItem({ ownerId: 'u1' })}
        user={{ id: 'u1', email: 'u1@x.com', firstName: 'A', lastName: 'B', name: 'A B', onboardingComplete: true }}
        onPromoteToMaster={onPromote}
      />
    );
    const btn = screen.getByText(/Promote to Master/i);
    // Click should call handler
    fireEvent.click(btn);
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it('does not show Promote to Master for masters', () => {
    render(
      <ActionsModal
        isOpen
        item={mkItem({ parentId: null, ownerId: 'u1' })}
        user={{ id: 'u1', email: 'u1@x.com', firstName: 'A', lastName: 'B', name: 'A B', onboardingComplete: true }}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText(/Promote to Master/i)).toBeNull();
  });
});

