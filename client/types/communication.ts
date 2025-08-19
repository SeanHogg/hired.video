/**
 * Communication system types that match the backend API exactly
 * Based on MyVideoResume.Abstractions.Communications namespace
 */

import { UserProfile } from '@/lib/services/user-service';

// Backend enums - must match exactly
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
export enum ConversationType {
  Direct = 0,
  Group = 1,
  Broadcast = 2,
}

export enum ConversationRole {
  Member = 0,
  Admin = 1,
  Owner = 2,
}

export enum MessageType {
  Text = 0,
  Image = 1,
  File = 2,
  System = 3,
}

export enum EmailTemplateCategory {
  Networking = 0,
  JobApplication = 1,
  FollowUp = 2,
  Introduction = 3,
  ThankYou = 4,
  Interview = 5,
  Rejection = 6,
  Offer = 7,
  General = 8,
}

export enum EmailTemplateTargetRole {
  All = 0,
  JobSeeker = 1,
  Recruiter = 2,
  Business = 3,
}

export enum EmailCampaignStatus {
  Draft = 0,
  Scheduled = 1,
  Sending = 2,
  Sent = 3,
  Paused = 4,
  Cancelled = 5,
}

export enum EmailDeliveryStatus {
  Pending = 0,
  Sent = 1,
  Delivered = 2,
  Opened = 3,
  Clicked = 4,
  Replied = 5,
  Bounced = 6,
  Failed = 7,
}

export enum CommunicationTrackingType {
  Outbound = 0,
  Inbound = 1,
  Internal = 2,
}

export enum CommunicationChannel {
  Email = 0,
  InternalMessage = 1,
  LinkedIn = 2,
  Phone = 3,
  SMS = 4,
  Other = 5,
}

export enum CommunicationTrackingStatus {
  Sent = 0,
  Delivered = 1,
  Read = 2,
  Replied = 3,
  NoResponse = 4,
  Bounced = 5,
  Failed = 6,
}

export enum CommunicationPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Urgent = 3,
}

export enum FollowUpType {
  Email = 0,
  Phone = 1,
  LinkedIn = 2,
  InPerson = 3,
  Other = 4,
}

export enum FollowUpStatus {
  Scheduled = 0,
  InProgress = 1,
  Completed = 2,
  Cancelled = 3,
  Overdue = 4,
}

export enum CommunicationFrequency {
  Daily = 0,
  Weekly = 1,
  BiWeekly = 2,
  Monthly = 3,
  Quarterly = 4,
  AsNeeded = 5,
}

// Core interfaces matching backend exactly
export interface ConversationDTO {
  id: string;
  title?: string;
  type: ConversationType;
  createdByUserId: string;
  companyId?: string;
  isArchived: boolean;
  isMuted: boolean;
  lastActivityAt: string;
  createdByUser?: UserProfile;
  participants: ConversationParticipantDTO[];
  messages: MessageDTO[];
  creationDateTime?: string;
  updateDateTime?: string;
}

export interface ConversationParticipantDTO {
  id: string;
  conversationId: string;
  userId: string;
  role: ConversationRole;
  joinedAt: string;
  lastReadAt?: string;
  hasLeft: boolean;
  leftAt?: string;
  user?: UserProfile;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  content: string;
  messageType: MessageType;
  attachmentUrl?: string;
  attachmentName?: string;
  replyToMessageId?: string;
  isEdited: boolean;
  editedAt?: string;
  isDeleted: boolean;
  deletedAt?: string;
  senderId: string;
  recipientId: string;
  sender?: UserProfile;
  replyToMessage?: MessageDTO;
  readReceipts: MessageReadReceiptDTO[];
  creationDateTime?: string;
  updateDateTime?: string;
}

export interface MessageReadReceiptDTO {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
  user?: UserProfile;
}

export interface EmailTemplateDTO {
  id: string;
  name: string;
  description?: string;
  subject: string;
  body: string;
  category: EmailTemplateCategory;
  targetRole: EmailTemplateTargetRole;
  isSystemTemplate: boolean;
  isActive: boolean;
  createdByUserId?: string;
  companyId?: string;
  variables?: string;
  usageCount: number;
  lastUsedAt?: string;
  createdByUser?: UserProfile;
  creationDateTime?: string;
  updateDateTime?: string;
}

export interface EmailCampaignDTO {
  id: string;
  name: string;
  description?: string;
  emailTemplateId: string;
  createdByUserId: string;
  companyId?: string;
  status: EmailCampaignStatus;
  sentAt?: string;
  totalRecipients: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsOpened: number;
  emailsClicked: number;
  repliesReceived: number;
  emailTemplate?: EmailTemplateDTO;
  createdByUser?: UserProfile;
  recipients: EmailCampaignRecipientDTO[];
  creationDateTime?: string;
  updateDateTime?: string;
}

export interface EmailCampaignRecipientDTO {
  id: string;
  emailCampaignId: string;
  email: string;
  name?: string;
  userId?: string;
  personalizationData?: string;
  status: EmailDeliveryStatus;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  errorMessage?: string;
  user?: UserProfile;
}

export interface CommunicationTrackingDTO {
  id: string;
  initiatorUserId: string;
  targetUserId?: string;
  externalEmail?: string;
  externalName?: string;
  companyId?: string;
  type: CommunicationTrackingType;
  channel: CommunicationChannel;
  subject?: string;
  content?: string;
  status: CommunicationTrackingStatus;
  priority: CommunicationPriority;
  tags?: string;
  followUpDate?: string;
  requiresFollowUp: boolean;
  followUpNotes?: string;
  responseReceivedAt?: string;
  responseContent?: string;
  responseSentiment?: string;
  relatedJobId?: string;
  relatedResumeId?: string;
  relatedConversationId?: string;
  relatedEmailCampaignId?: string;
  metadata?: string;
  initiatorUser?: UserProfile;
  targetUser?: UserProfile;
  followUps: CommunicationFollowUpDTO[];
  creationDateTime?: string;
  updateDateTime?: string;
}

export interface CommunicationFollowUpDTO {
  id: string;
  communicationTrackingId: string;
  userId: string;
  type: FollowUpType;
  scheduledDate: string;
  completedDate?: string;
  status: FollowUpStatus;
  notes?: string;
  result?: string;
  nextFollowUpDate?: string;
  user?: UserProfile;
}

export interface ExternalContactDTO {
  id: string;
  userId: string;
  companyId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  companyName?: string;
  phone?: string;
  linkedInUrl?: string;
  location?: string;
  notes?: string;
  tags?: string;
  lastCommunicationAt?: string;
  preferredFrequency?: CommunicationFrequency;
  isActive: boolean;
  user?: UserProfile;
  creationDateTime?: string;
  updateDateTime?: string;
}

// Request/Response types for API calls
export interface CreateConversationRequest {
  title?: string;
  type: ConversationType;
  participantUserIds: string[];
  initialMessage?: string;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  messageType?: MessageType;
  replyToMessageId?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface CreateEmailTemplateRequest {
  name: string;
  description?: string;
  subject: string;
  body: string;
  category: EmailTemplateCategory;
  targetRole: EmailTemplateTargetRole;
  variables?: string;
}

export interface UpdateEmailTemplateRequest extends CreateEmailTemplateRequest {
  id: string;
}

export interface CreateEmailCampaignRequest {
  name: string;
  description?: string;
  emailTemplateId: string;
  recipients: EmailCampaignRecipientRequest[];
}

export interface EmailCampaignRecipientRequest {
  email: string;
  name?: string;
  userId?: string;
  personalizationData?: Record<string, string | number | boolean>;
}

export interface CreateCommunicationTrackingRequest {
  targetUserId?: string;
  externalEmail?: string;
  externalName?: string;
  type: CommunicationTrackingType;
  channel: CommunicationChannel;
  subject?: string;
  content?: string;
  priority?: CommunicationPriority;
  tags?: string[];
  followUpDate?: string;
  requiresFollowUp?: boolean;
  followUpNotes?: string;
  relatedJobId?: string;
  relatedResumeId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface CreateFollowUpRequest {
  communicationTrackingId: string;
  type: FollowUpType;
  scheduledDate: string;
  notes?: string;
}

export interface CreateExternalContactRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  companyName?: string;
  phone?: string;
  linkedInUrl?: string;
  location?: string;
  notes?: string;
  tags?: string[];
  preferredFrequency?: CommunicationFrequency;
}

export interface UpdateExternalContactRequest extends CreateExternalContactRequest {
  id: string;
}

// Filtering and search types
export interface ConversationFilters {
  type?: ConversationType[];
  isArchived?: boolean;
  participantUserId?: string;
  companyId?: string;
}

export interface MessageFilters {
  conversationId?: string;
  senderId?: string;
  messageType?: MessageType[];
  dateFrom?: string;
  dateTo?: string;
}

export interface EmailTemplateFilters {
  category?: EmailTemplateCategory[];
  targetRole?: EmailTemplateTargetRole[];
  isSystemTemplate?: boolean;
  isActive?: boolean;
  createdByUserId?: string;
}

export interface CommunicationTrackingFilters {
  type?: CommunicationTrackingType[];
  channel?: CommunicationChannel[];
  status?: CommunicationTrackingStatus[];
  priority?: CommunicationPriority[];
  requiresFollowUp?: boolean;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
}

// UI-specific types
export interface ConversationListItem {
  id: string;
  title: string;
  type: ConversationType;
  participantCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    timestamp: string;
  };
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
}

export interface MessageListItem {
  id: string;
  content: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
  isOwn: boolean;
  messageType: MessageType;
  attachmentUrl?: string;
  attachmentName?: string;
  isEdited: boolean;
  replyTo?: {
    content: string;
    senderName: string;
  };
}

export interface EmailTemplateVariable {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

export interface CommunicationStats {
  totalMessages: number;
  totalConversations: number;
  totalEmailsSent: number;
  averageResponseTime: number;
  responseRate: number;
  activeConversations: number;
  pendingFollowUps: number;
}
