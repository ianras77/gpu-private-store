import type {
  MessagingProvider,
  ProviderEventRef,
  ProviderRoomRef,
  ProviderUserRef,
  SendApprovedMessageInput,
  TimelineEvent
} from './types.js';

function localUserId(userId: string) {
  return `local:user:${userId}`;
}

function localRoomId(conversationId: string) {
  return `local:room:${conversationId}`;
}

function localEventId(eventId: string) {
  return `local:event:${eventId}`;
}

export class LocalMessagingProvider implements MessagingProvider {
  readonly name = 'local';

  async ensureUser(input: { userId: string }): Promise<ProviderUserRef> {
    return {
      localUserId: input.userId,
      providerUserId: localUserId(input.userId)
    };
  }

  async createRoom(input: {
    conversationId: string;
    topic: string;
    memberUserIds: string[];
  }): Promise<ProviderRoomRef> {
    return {
      localConversationId: input.conversationId,
      providerRoomId: localRoomId(input.conversationId)
    };
  }

  async inviteMember(_input: { conversationId: string; userId: string }): Promise<void> {
    return;
  }

  async sendApprovedMessage(input: SendApprovedMessageInput): Promise<ProviderEventRef> {
    return {
      localEventId: input.localEventId,
      providerEventId: localEventId(input.localEventId),
      providerRoomId: localRoomId(input.conversationId)
    };
  }

  async markRead(_input: {
    conversationId: string;
    userId: string;
    providerEventId: string;
  }): Promise<void> {
    return;
  }

  async loadTimeline(_input: {
    conversationId: string;
    from?: string;
    limit: number;
  }): Promise<TimelineEvent[]> {
    return [];
  }
}
