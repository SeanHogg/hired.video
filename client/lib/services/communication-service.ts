/**
 * Communication Service - Handles all communication-related API operations
 * Integrates with messaging, email templates, campaigns, and tracking
 */

import { apiClient } from '@/lib/api-client';
import {
  ConversationDTO,
  MessageDTO,
  EmailTemplateDTO,
  EmailCampaignDTO,
  CommunicationTrackingDTO,
  ExternalContactDTO,
  CreateConversationRequest,
  SendMessageRequest,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  CreateEmailCampaignRequest,
  CreateCommunicationTrackingRequest,
  CreateFollowUpRequest,
  CreateExternalContactRequest,
  UpdateExternalContactRequest,
  ConversationFilters,
  MessageFilters,
  EmailTemplateFilters,
  CommunicationTrackingFilters,
  ConversationListItem,
  MessageListItem,
  CommunicationStats,
  ConversationType,
} from '@/types/communication';

export class CommunicationService {
  private readonly baseUrl = '/api/communication';

  // ===== CONVERSATIONS & MESSAGING =====

  /**
   * Get all conversations for the current user
   */
  async getConversations(filters?: ConversationFilters): Promise<ConversationListItem[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters) {
        if (filters.type?.length) {
          filters.type.forEach(type => params.append('type', type.toString()));
        }
        if (filters.isArchived !== undefined) {
          params.append('isArchived', filters.isArchived.toString());
        }
        if (filters.participantUserId) {
          params.append('participantUserId', filters.participantUserId);
        }
        if (filters.companyId) {
          params.append('companyId', filters.companyId);
        }
      }

      const queryString = params.toString();
      const url = queryString ? `${this.baseUrl}/conversations?${queryString}` : `${this.baseUrl}/conversations`;
      
      const response = await apiClient.get<ConversationDTO[]>(url);
      
      // Transform to UI format
      return response.data.map(conv => ({
        id: conv.id,
        title: conv.title || this.generateConversationTitle(conv),
        type: conv.type,
        participantCount: conv.participants.length,
        lastMessage: conv.messages.length > 0 ? {
          content: conv.messages[conv.messages.length - 1].content,
          senderName: conv.messages[conv.messages.length - 1].sender?.firstName + ' ' + conv.messages[conv.messages.length - 1].sender?.lastName || 'Unknown',
          timestamp: conv.messages[conv.messages.length - 1].creationDateTime || '',
        } : undefined,
        unreadCount: this.calculateUnreadCount(),
        isArchived: conv.isArchived,
        isMuted: conv.isMuted,
      }));
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      throw new Error('Failed to fetch conversations');
    }
  }

  /**
   * Get a specific conversation with messages
   */
  async getConversation(conversationId: string): Promise<ConversationDTO> {
    try {
      const response = await apiClient.get<ConversationDTO>(`${this.baseUrl}/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch conversation ${conversationId}:`, error);
      throw new Error(`Failed to fetch conversation ${conversationId}`);
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(request: CreateConversationRequest): Promise<ConversationDTO> {
    try {
      const response = await apiClient.post<ConversationDTO>(`${this.baseUrl}/conversations`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      throw new Error('Failed to create conversation');
    }
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(request: SendMessageRequest): Promise<MessageDTO> {
    try {
      const response = await apiClient.post<MessageDTO>(`${this.baseUrl}/messages`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw new Error('Failed to send message');
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, filters?: MessageFilters): Promise<MessageListItem[]> {
    try {
      const params = new URLSearchParams();
      params.append('conversationId', conversationId);
      
      if (filters) {
        if (filters.senderId) {
          params.append('senderId', filters.senderId);
        }
        if (filters.messageType?.length) {
          filters.messageType.forEach(type => params.append('messageType', type.toString()));
        }
        if (filters.dateFrom) {
          params.append('dateFrom', filters.dateFrom);
        }
        if (filters.dateTo) {
          params.append('dateTo', filters.dateTo);
        }
      }

      const response = await apiClient.get<MessageDTO[]>(`${this.baseUrl}/messages?${params.toString()}`);
      
      // Transform to UI format
      return response.data.map(msg => ({
        id: msg.id,
        content: msg.content,
        senderName: msg.sender?.firstName + ' ' + msg.sender?.lastName || 'Unknown',
        senderAvatar: msg.sender?.profilePicture,
        timestamp: msg.creationDateTime || '',
        isOwn: false, // Will be set by the UI based on current user
        messageType: msg.messageType,
        attachmentUrl: msg.attachmentUrl,
        attachmentName: msg.attachmentName,
        isEdited: msg.isEdited,
        replyTo: msg.replyToMessage ? {
          content: msg.replyToMessage.content,
          senderName: msg.replyToMessage.sender?.firstName + ' ' + msg.replyToMessage.sender?.lastName || 'Unknown',
        } : undefined,
      }));
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      throw new Error('Failed to fetch messages');
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(messageIds: string[]): Promise<void> {
    try {
      await apiClient.post(`${this.baseUrl}/messages/mark-read`, { messageIds });
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
      throw new Error('Failed to mark messages as read');
    }
  }

  // ===== EMAIL TEMPLATES =====

  /**
   * Get email templates
   */
  async getEmailTemplates(filters?: EmailTemplateFilters): Promise<EmailTemplateDTO[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters) {
        if (filters.category?.length) {
          filters.category.forEach(cat => params.append('category', cat.toString()));
        }
        if (filters.targetRole?.length) {
          filters.targetRole.forEach(role => params.append('targetRole', role.toString()));
        }
        if (filters.isSystemTemplate !== undefined) {
          params.append('isSystemTemplate', filters.isSystemTemplate.toString());
        }
        if (filters.isActive !== undefined) {
          params.append('isActive', filters.isActive.toString());
        }
        if (filters.createdByUserId) {
          params.append('createdByUserId', filters.createdByUserId);
        }
      }

      const queryString = params.toString();
      const url = queryString ? `${this.baseUrl}/email-templates?${queryString}` : `${this.baseUrl}/email-templates`;
      
      const response = await apiClient.get<EmailTemplateDTO[]>(url);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch email templates:', error);
      throw new Error('Failed to fetch email templates');
    }
  }

  /**
   * Get a specific email template
   */
  async getEmailTemplate(templateId: string): Promise<EmailTemplateDTO> {
    try {
      const response = await apiClient.get<EmailTemplateDTO>(`${this.baseUrl}/email-templates/${templateId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch email template ${templateId}:`, error);
      throw new Error(`Failed to fetch email template ${templateId}`);
    }
  }

  /**
   * Create a new email template
   */
  async createEmailTemplate(request: CreateEmailTemplateRequest): Promise<EmailTemplateDTO> {
    try {
      const response = await apiClient.post<EmailTemplateDTO>(`${this.baseUrl}/email-templates`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to create email template:', error);
      throw new Error('Failed to create email template');
    }
  }

  /**
   * Update an email template
   */
  async updateEmailTemplate(request: UpdateEmailTemplateRequest): Promise<EmailTemplateDTO> {
    try {
      const response = await apiClient.put<EmailTemplateDTO>(`${this.baseUrl}/email-templates/${request.id}`, request);
      return response.data;
    } catch (error) {
      console.error(`Failed to update email template ${request.id}:`, error);
      throw new Error(`Failed to update email template ${request.id}`);
    }
  }

  /**
   * Delete an email template
   */
  async deleteEmailTemplate(templateId: string): Promise<void> {
    try {
      await apiClient.delete(`${this.baseUrl}/email-templates/${templateId}`);
    } catch (error) {
      console.error(`Failed to delete email template ${templateId}:`, error);
      throw new Error(`Failed to delete email template ${templateId}`);
    }
  }

  // ===== EMAIL CAMPAIGNS =====

  /**
   * Get email campaigns
   */
  async getEmailCampaigns(): Promise<EmailCampaignDTO[]> {
    try {
      const response = await apiClient.get<EmailCampaignDTO[]>(`${this.baseUrl}/email-campaigns`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch email campaigns:', error);
      throw new Error('Failed to fetch email campaigns');
    }
  }

  /**
   * Create a new email campaign
   */
  async createEmailCampaign(request: CreateEmailCampaignRequest): Promise<EmailCampaignDTO> {
    try {
      const response = await apiClient.post<EmailCampaignDTO>(`${this.baseUrl}/email-campaigns`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to create email campaign:', error);
      throw new Error('Failed to create email campaign');
    }
  }

  /**
   * Send an email campaign
   */
  async sendEmailCampaign(campaignId: string): Promise<void> {
    try {
      await apiClient.post(`${this.baseUrl}/email-campaigns/${campaignId}/send`);
    } catch (error) {
      console.error(`Failed to send email campaign ${campaignId}:`, error);
      throw new Error(`Failed to send email campaign ${campaignId}`);
    }
  }

  // ===== COMMUNICATION TRACKING =====

  /**
   * Get communication tracking records
   */
  async getCommunicationTracking(filters?: CommunicationTrackingFilters): Promise<CommunicationTrackingDTO[]> {
    try {
      const params = new URLSearchParams();

      if (filters) {
        if (filters.type?.length) {
          filters.type.forEach(type => params.append('type', type.toString()));
        }
        if (filters.channel?.length) {
          filters.channel.forEach(channel => params.append('channel', channel.toString()));
        }
        if (filters.status?.length) {
          filters.status.forEach(status => params.append('status', status.toString()));
        }
        if (filters.priority?.length) {
          filters.priority.forEach(priority => params.append('priority', priority.toString()));
        }
        if (filters.requiresFollowUp !== undefined) {
          params.append('requiresFollowUp', filters.requiresFollowUp.toString());
        }
        if (filters.dateFrom) {
          params.append('dateFrom', filters.dateFrom);
        }
        if (filters.dateTo) {
          params.append('dateTo', filters.dateTo);
        }
        if (filters.tags?.length) {
          filters.tags.forEach(tag => params.append('tags', tag));
        }
      }

      const queryString = params.toString();
      const url = queryString ? `${this.baseUrl}/tracking?${queryString}` : `${this.baseUrl}/tracking`;

      const response = await apiClient.get<CommunicationTrackingDTO[]>(url);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch communication tracking:', error);
      throw new Error('Failed to fetch communication tracking');
    }
  }

  /**
   * Create a communication tracking record
   */
  async createCommunicationTracking(request: CreateCommunicationTrackingRequest): Promise<CommunicationTrackingDTO> {
    try {
      const response = await apiClient.post<CommunicationTrackingDTO>(`${this.baseUrl}/tracking`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to create communication tracking:', error);
      throw new Error('Failed to create communication tracking');
    }
  }

  /**
   * Create a follow-up for a communication
   */
  async createFollowUp(request: CreateFollowUpRequest): Promise<void> {
    try {
      await apiClient.post(`${this.baseUrl}/follow-ups`, request);
    } catch (error) {
      console.error('Failed to create follow-up:', error);
      throw new Error('Failed to create follow-up');
    }
  }

  // ===== EXTERNAL CONTACTS =====

  /**
   * Get external contacts
   */
  async getExternalContacts(): Promise<ExternalContactDTO[]> {
    try {
      const response = await apiClient.get<ExternalContactDTO[]>(`${this.baseUrl}/external-contacts`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch external contacts:', error);
      throw new Error('Failed to fetch external contacts');
    }
  }

  /**
   * Create an external contact
   */
  async createExternalContact(request: CreateExternalContactRequest): Promise<ExternalContactDTO> {
    try {
      const response = await apiClient.post<ExternalContactDTO>(`${this.baseUrl}/external-contacts`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to create external contact:', error);
      throw new Error('Failed to create external contact');
    }
  }

  /**
   * Update an external contact
   */
  async updateExternalContact(request: UpdateExternalContactRequest): Promise<ExternalContactDTO> {
    try {
      const response = await apiClient.put<ExternalContactDTO>(`${this.baseUrl}/external-contacts/${request.id}`, request);
      return response.data;
    } catch (error) {
      console.error(`Failed to update external contact ${request.id}:`, error);
      throw new Error(`Failed to update external contact ${request.id}`);
    }
  }

  /**
   * Delete an external contact
   */
  async deleteExternalContact(contactId: string): Promise<void> {
    try {
      await apiClient.delete(`${this.baseUrl}/external-contacts/${contactId}`);
    } catch (error) {
      console.error(`Failed to delete external contact ${contactId}:`, error);
      throw new Error(`Failed to delete external contact ${contactId}`);
    }
  }

  // ===== ANALYTICS & STATS =====

  /**
   * Get communication statistics
   */
  async getCommunicationStats(): Promise<CommunicationStats> {
    try {
      const response = await apiClient.get<CommunicationStats>(`${this.baseUrl}/stats`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch communication stats:', error);
      throw new Error('Failed to fetch communication stats');
    }
  }

  // ===== GROUP COMMUNICATION (Business/Recruiter) =====

  /**
   * Get team members for group communication (business/recruiter accounts)
   */
  async getTeamMembers(): Promise<{ id: string; userProfile?: { id: string; firstName: string; lastName: string; role?: string } }[]> {
    try {
      const response = await apiClient.get<{ id: string; userProfile?: { id: string; firstName: string; lastName: string; role?: string } }[]>('/api/account/users');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch team members:', error);
      throw new Error('Failed to fetch team members');
    }
  }

  /**
   * Create a group conversation with team members
   */
  async createGroupConversation(title: string, memberUserIds: string[], initialMessage?: string): Promise<ConversationDTO> {
    const request: CreateConversationRequest = {
      title,
      type: ConversationType.Group,
      participantUserIds: memberUserIds,
      initialMessage,
    };

    return this.createConversation(request);
  }

  /**
   * Send a broadcast message to multiple team members
   */
  async sendBroadcastMessage(title: string, content: string, recipientUserIds: string[]): Promise<ConversationDTO> {
    const request: CreateConversationRequest = {
      title,
      type: ConversationType.Broadcast,
      participantUserIds: recipientUserIds,
      initialMessage: content,
    };

    return this.createConversation(request);
  }

  // ===== HELPER METHODS =====

  private generateConversationTitle(conversation: ConversationDTO): string {
    if (conversation.type === ConversationType.Direct) {
      const otherParticipant = conversation.participants.find(p => p.userId !== conversation.createdByUserId);
      return otherParticipant?.user ? `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}` : 'Direct Message';
    }
    return conversation.type === ConversationType.Group ? 'Group Chat' : 'Broadcast';
  }

  private calculateUnreadCount(): number {
    // This would need to be calculated based on the current user's last read timestamp
    // For now, return 0 as a placeholder
    return 0;
  }
}

// Export singleton instance
export const communicationService = new CommunicationService();
