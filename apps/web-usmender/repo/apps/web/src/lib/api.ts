export const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? '/api').replace(/\/$/, '');

function resolveApiPath(path: string) {
  return `${apiBase}${path}`;
}

function resolveApiEventUrl(path: string) {
  const nextPath = resolveApiPath(path);

  if (/^https?:\/\//i.test(nextPath)) {
    return nextPath;
  }

  if (typeof window === 'undefined') {
    return nextPath;
  }

  return new URL(nextPath, window.location.origin).toString();
}

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type SessionParticipant = {
  id: string;
  displayName: string;
  role: string;
  consentStatus: string;
  lastSeenAt?: string | null;
  lastReadSequence?: number;
};

export type DeliverySummary = {
  channel: string;
  status: string;
  provider: string | null;
  lastError: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  recipient: string | null;
  providerMessageId?: string | null;
};

export type RoomInvite = {
  id: string;
  status: string;
  deliveryChannel: InviteDeliveryChannel;
  destination: string;
  expiresAt: string;
  createdAt: string;
  openedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  latestDelivery: DeliverySummary;
};

export type RoomPayload = {
  session: {
    id: string;
    topic: string;
    status: string;
    revision?: number;
    createdAt: string;
    updatedAt?: string;
    lastEventAt?: string | null;
    closedAt: string | null;
  };
  me: { id: string; displayName: string; role: string; lastReadSequence?: number };
  participants: SessionParticipant[];
  invite: RoomInvite | null;
  messages: {
    private: {
      id: string;
      content: string;
      createdAt: string;
      timelineOrder: number;
      turnId: string | null;
      clientMessageId: string | null;
    }[];
    shared: {
      id: string;
      content: string;
      createdAt: string;
      timelineOrder: number;
      authorUserId: string | null;
      delivery: {
        turnId: string;
        clientMessageId: string;
        source: string;
        channel: string;
        approvedAt: string;
        status: string;
        provider: string | null;
        lastError: string | null;
        sentAt: string | null;
        deliveredAt: string | null;
        recipient: string | null;
      } | null;
    }[];
    system: { id: string; content: string; kind: string; createdAt: string; timelineOrder: number }[];
  };
  intake: {
    complete: boolean;
    waitingOn: SessionParticipant[];
    latestQuestion: string | null;
  };
  proposal: {
    id: string;
    version: number;
    title: string;
    bullets: string[];
    acceptanceCriteria: string[];
    votes: { userId: string; value: string; comment: string | null }[];
  } | null;
  capabilities: {
    canCompose: boolean;
    canGenerateProposal: boolean;
    canVote: boolean;
    canInvite: boolean;
    canResendInvite: boolean;
  };
  workflow?: Record<string, unknown>;
};

export type InviteDraft = {
  subjectLine: string;
  inviteMessageNeutral: string;
  issueSummaryNeutral: string;
};

export type InviteDeliveryChannel = 'IN_APP' | 'SMS_LINK' | 'EMAIL_LINK' | 'IMESSAGE_HANDOFF';

export type MessagePreview = {
  previewId: string;
  sessionRevision: number;
  rawText: string;
  moderatedText: string;
  recipientView: string;
  coachNote: string;
  latestOtherSummary: string | null;
  latestMediatorPrompt: string | null;
  approvalChecklist: string[];
  followUpQuestion: string | null;
};

export type MessagePreviewResponse = {
  preview: MessagePreview;
  approvalToken: string;
  safetyFlag: { flagged: boolean; reason?: string };
};

export type SessionInboxItem = {
  id: string;
  topic: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  closedAt: string | null;
  me: {
    id: string;
    role: string;
    consentStatus: string;
    lastSeenAt: string | null;
    lastReadSequence?: number;
  };
  participants: SessionParticipant[];
  latestMessage: {
    id: string;
    visibility: string;
    kind: string;
    snippet: string;
    createdAt: string;
    authorUserId: string | null;
    authorDisplayName: string | null;
    authorRole: string | null;
  } | null;
  invite: {
    id: string;
    status: string;
    deliveryChannel: InviteDeliveryChannel;
    destination: string;
    expiresAt: string;
    createdAt: string;
    openedAt: string | null;
    acceptedAt: string | null;
    declinedAt: string | null;
    expiredAt: string | null;
    latestDelivery: DeliverySummary;
  } | null;
  cues: {
    unread: boolean;
    waitingOnMe: boolean;
    waitingOnOthers: boolean;
    waitingOn: {
      id: string;
      displayName: string;
      role: string;
    }[];
    reason: string | null;
  };
};

export type MePayload = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export type UserSearchResult = {
  id: string;
  email: string;
  displayName: string;
};

export type PlanInfo = {
  plan: 'FREE' | 'PREMIUM';
  sessionsThisMonth: number;
  limit: number | null;
  upgradeAvailable: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('usmender.token') : null;
  const response = await fetch(resolveApiPath(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

export async function signUp(input: { email: string; displayName: string; password: string }) {
  return request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function login(input: { email: string; password: string }) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchMe() {
  return request<MePayload>('/me');
}

export async function fetchPlan() {
  return request<PlanInfo>('/plan');
}

export async function listSessions() {
  return request<{ sessions: SessionInboxItem[] }>('/sessions');
}

export async function searchUsers(query: string) {
  const params = new URLSearchParams({ q: query });
  return request<{ query: string; results: UserSearchResult[] }>(`/users/search?${params.toString()}`);
}

export async function createRelationship(input: { label?: string }) {
  return request<{ id: string }>('/relationships', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function createSession(input: { relationshipId: string; topic: string }) {
  return request<{ id: string; status: string }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function submitNeed(input: {
  sessionId: string;
  content: string;
  relationshipType?: string;
  desiredOutcome?: string;
  boundaries?: string[];
}) {
  return request<{
    session: { id: string; status: string };
    inviteDraft?: InviteDraft;
    safetyFlag?: { flagged: boolean; reason?: string };
  }>(`/sessions/${input.sessionId}/need`, {
    method: 'POST',
    body: JSON.stringify({
      content: input.content,
      relationshipType: input.relationshipType,
      desiredOutcome: input.desiredOutcome,
      boundaries: input.boundaries
    })
  });
}

export async function sendInvite(input: {
  sessionId: string;
  inviteeEmailOrPhone: string;
  deliveryChannel?: InviteDeliveryChannel;
}) {
  return request<{
    inviteToken: string;
    inviteUrl: string;
    expiresAt: string;
    sessionId: string;
    deliveryChannel: InviteDeliveryChannel;
    delivery: {
      status: string;
      provider: string;
      errorMessage: string | null;
      sentAt: string | null;
      deliveredAt: string | null;
    };
  }>(`/sessions/${input.sessionId}/invite`, {
    method: 'POST',
    body: JSON.stringify({
      inviteeEmailOrPhone: input.inviteeEmailOrPhone,
      deliveryChannel: input.deliveryChannel
    })
  });
}

export async function fetchSessionRoom(sessionId: string) {
  return request<RoomPayload>(`/sessions/${sessionId}/room`);
}

export async function markSessionRead(input: { sessionId: string; revision?: number }) {
  return request<{ ok: true; revision: number; acknowledgedRevision: number }>(
    `/sessions/${input.sessionId}/read`,
    {
      method: 'POST',
      body: JSON.stringify({
        revision: input.revision
      })
    }
  );
}

export async function submitIntake(input: { sessionId: string; content: string }) {
  return request<RoomPayload>(`/sessions/${input.sessionId}/intake`, {
    method: 'POST',
    body: JSON.stringify({ content: input.content })
  });
}

export async function sendMediatedMessage(input: {
  sessionId: string;
  content: string;
  previewId: string;
  approvalToken: string;
  clientMessageId: string;
  deliveryChannel?: InviteDeliveryChannel;
}) {
  return request<RoomPayload>(`/sessions/${input.sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({
      content: input.content,
      previewId: input.previewId,
      approvalToken: input.approvalToken,
      clientMessageId: input.clientMessageId,
      deliveryChannel: input.deliveryChannel
    })
  });
}

export async function previewMediatedMessage(input: { sessionId: string; content: string }) {
  return request<MessagePreviewResponse>(`/sessions/${input.sessionId}/message-preview`, {
    method: 'POST',
    body: JSON.stringify({ content: input.content })
  });
}

export async function generateProposal(sessionId: string) {
  return request<RoomPayload>(`/sessions/${sessionId}/proposals`, {
    method: 'POST'
  });
}

export async function submitVote(input: {
  sessionId: string;
  value: 'YES' | 'NO' | 'NEEDS_CHANGES';
  comment?: string;
}) {
  return request<RoomPayload>(`/sessions/${input.sessionId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ value: input.value, comment: input.comment })
  });
}

export async function fetchInvite(token: string) {
  return request<{
    token: string;
    status: string;
    inviteeEmailOrPhone: string;
    deliveryChannel: InviteDeliveryChannel;
    inviteUrl: string;
    session: { id: string; topic: string; status: string };
  }>(`/invites/${token}`);
}

export async function acceptInvite(input: {
  token: string;
  email: string;
  displayName: string;
  password: string;
}) {
  return request<{
    session: { id: string; status: string };
    token: string;
    user: AuthUser;
  }>(`/invites/${input.token}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName,
      password: input.password
    })
  });
}

export async function declineInvite(token: string) {
  return request<{ session: { id: string; status: string } }>(`/invites/${token}/decline`, {
    method: 'POST'
  });
}

export async function createSessionStream(sessionId: string) {
  const { streamToken } = await request<{ streamToken: string; expiresInSeconds: number }>(
    `/sessions/${sessionId}/stream-token`,
    {
      method: 'POST'
    }
  );

  const url = new URL(resolveApiEventUrl(`/sessions/${sessionId}/events`));
  url.searchParams.set('streamToken', streamToken);
  return new EventSource(url.toString());
}
