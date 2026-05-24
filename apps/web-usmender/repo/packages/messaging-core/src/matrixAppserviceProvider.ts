import {
  MessagingProviderError,
  type MessagingProvider,
  type ProviderEventRef,
  type ProviderRoomRef,
  type ProviderUserRef,
  type SendApprovedMessageInput,
  type TimelineEvent
} from './types.js';

type MatrixAppserviceProviderOptions = {
  baseUrl: string;
  token?: string | undefined;
  timeoutMs?: number;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, '');
}

async function readError(response: Response) {
  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}

export class MatrixAppserviceProvider implements MessagingProvider {
  readonly name = 'matrix';
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: MatrixAppserviceProviderOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers ?? {})
      },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new MessagingProviderError(
        `Matrix appservice request failed for ${path}: ${await readError(response)}`,
        this.name,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  ensureUser(input: { userId: string; displayName: string }): Promise<ProviderUserRef> {
    return this.request<ProviderUserRef>('/v0/users/ensure', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  createRoom(input: {
    conversationId: string;
    topic: string;
    memberUserIds: string[];
  }): Promise<ProviderRoomRef> {
    return this.request<ProviderRoomRef>('/v0/rooms', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async inviteMember(input: { conversationId: string; userId: string }): Promise<void> {
    await this.request<{ ok: true }>('/v0/rooms/invite', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  sendApprovedMessage(input: SendApprovedMessageInput): Promise<ProviderEventRef> {
    return this.request<ProviderEventRef>('/v0/messages/approved', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async markRead(input: {
    conversationId: string;
    userId: string;
    providerEventId: string;
  }): Promise<void> {
    await this.request<{ ok: true }>('/v0/read', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async loadTimeline(input: {
    conversationId: string;
    from?: string;
    limit: number;
  }): Promise<TimelineEvent[]> {
    const params = new URLSearchParams({
      limit: String(input.limit)
    });
    if (input.from) {
      params.set('from', input.from);
    }

    const result = await this.request<{ events: TimelineEvent[] }>(
      `/v0/rooms/${encodeURIComponent(input.conversationId)}/timeline?${params.toString()}`
    );

    return result.events;
  }
}
