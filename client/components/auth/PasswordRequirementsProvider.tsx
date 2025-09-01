import React, { createContext, useContext, ReactNode } from 'react';
import { usePasswordRequirements } from '@/hooks/usePasswordRequirements';
import { ForcePasswordChangeModal } from './ForcePasswordChangeModal';

interface PasswordRequirementsContextType {
  requirements: {
    requiresPasswordChange: boolean;
    changePassword: (newPassword: string) => Promise<{ success: boolean; error?: { message: string } }>;
  } | null;
  isLoading: boolean;
  error: string | null;
  checkRequirements: () => Promise<void>;
}

const PasswordRequirementsContext = createContext<PasswordRequirementsContextType | undefined>(undefined);

interface PasswordRequirementsProviderProps {
  children: ReactNode;
}

export const PasswordRequirementsProvider: React.FC<PasswordRequirementsProviderProps> = ({ children }) => {
  const {
    requirements,
    isLoading,
    error,
    checkRequirements,
    showModal,
    setShowModal,
    handlePasswordChanged
  } = usePasswordRequirements();

  const contextValue = {
    requirements,
    isLoading,
    error,
    checkRequirements
  };

  return (
    <PasswordRequirementsContext.Provider value={contextValue}>
      {children}
      
      {/* Global password change modal */}
      {requirements && (
        <ForcePasswordChangeModal
          isOpen={showModal}
          requirements={requirements}
          onPasswordChanged={handlePasswordChanged}
          onClose={requirements.canSkip ? () => setShowModal(false) : undefined}
        />
      )}
    </PasswordRequirementsContext.Provider>
  );
};

export const usePasswordRequirementsContext = () => {
  const context = useContext(PasswordRequirementsContext);
  if (context === undefined) {
    throw new Error('usePasswordRequirementsContext must be used within a PasswordRequirementsProvider');
  }
  return context;
};
