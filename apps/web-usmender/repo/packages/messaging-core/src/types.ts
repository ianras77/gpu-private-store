export type ProviderUserRef = {
  localUserId: string;
  providerUserId: string;
};

export type ProviderRoomRef = {
  localConversationId: string;
  providerRoomId: string;
};

export type ProviderEventRef = {
  localEventId: string;
  providerEventId: string;
  providerRoomId: string;
};

export type MessageKind =
  | 'USER_APPROVED'
  | 'MEDIATOR_CARD'
  | 'PROPOSAL_CARD'
  | 'VOTE_CARD'
  | 'SYSTEM_CARD';

export type SendApprovedMessageInput = {
  conversationId: string;
  authorUserId: string;
  approvedText: string;
  localEventId: string;
  metadata: {
    messageKind: MessageKind;
    mediationTurnId?: string;
    approvalPreviewId?: string;
    sessionRevision?: number;
  };
};

export type TimelineEvent = {
  providerEventId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
};

export interface MessagingProvider {
  readonly name: string;
  ensureUser(input: { userId: string; displayName: string }): Promise<ProviderUserRef>;
  createRoom(input: {
    conversationId: string;
    topic: string;
    memberUserIds: string[];
  }): Promise<ProviderRoomRef>;
  inviteMember(input: { conversationId: string; userId: string }): Promise<void>;
  sendApprovedMessage(input: SendApprovedMessageInput): Promise<ProviderEventRef>;
  markRead(input: {
    conversationId: string;
    userId: string;
    providerEventId: string;
  }): Promise<void>;
  loadTimeline(input: {
    conversationId: string;
    from?: string;
    limit: number;
  }): Promise<TimelineEvent[]>;
}

export class MessagingProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'MessagingProviderError';
  }
}
