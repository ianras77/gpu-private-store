# Matrix Core Implementation Design

Status: initial blueprint, 2026-05-23.

## Goal

Matrix is the local messaging core. USMender is the product, policy, and client layer around it.

Users should use USMender web/mobile clients for normal work. Synapse should remain a standard local service that can be updated independently. Generic Matrix clients are useful for admin/debugging, but they are not the intended user flow because they can bypass private drafts and mediator approval.

## Service Boundaries

### `matrix`

Local Synapse homeserver.

Responsibilities:

- Own Matrix rooms, events, membership, media, device state, and sync.
- Store durable shared room history.
- Expose standard Matrix client/server APIs to trusted USMender services.
- Stay updateable through normal Synapse image upgrades.

Non-responsibilities:

- It does not know about mediation policy.
- It does not receive raw drafts.
- It does not decide when a message is safe to send.

### `matrix-appservice`

USMender-owned Matrix application service.

Responsibilities:

- Register the USMender mediator namespace.
- Create or join rooms on behalf of the mediator service.
- Post approved user/mediator events into Matrix.
- Mirror Matrix event ids back into USMender.
- Listen for Matrix events that need USMender indexing or read-state updates.

Non-responsibilities:

- It does not rewrite already-sent user messages.
- It does not expose generic Matrix controls to the UI.
- It does not store raw drafts.

### `api`

USMender command API.

Responsibilities:

- Authenticate USMender users.
- Map USMender users to Matrix users.
- Create conversations and invite members.
- Store private drafts and approval previews.
- Start mediation jobs.
- Approve, reject, or edit mediated previews.
- Publish approved messages through `MessagingProvider`.
- Return UI-shaped inbox/thread snapshots.

### `worker`

Async mediation and retrieval worker.

Responsibilities:

- Run safety checks.
- Build retrieval bundles from Matrix timeline plus USMender memory.
- Call mediation providers.
- Persist previews and job results.
- Embed approved shared events.
- Update durable room memory.
- Retry delivery/indexing work.

### `web` and `ios`

USMender clients.

Responsibilities:

- Show inbox and thread UI.
- Capture private drafts.
- Show rewrite previews and approval controls.
- Render Matrix-backed room events as USMender message cards.
- Keep users inside the USMender safety contract.

## Provider Interface

Start with an interface in `packages/messaging-core`.

```ts
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

export type SendApprovedMessageInput = {
  conversationId: string;
  authorUserId: string;
  approvedText: string;
  localEventId: string;
  metadata: {
    mediationTurnId?: string;
    approvalPreviewId?: string;
    messageKind: 'USER_APPROVED' | 'MEDIATOR_CARD' | 'PROPOSAL_CARD' | 'VOTE_CARD';
  };
};

export interface MessagingProvider {
  ensureUser(input: { userId: string; displayName: string }): Promise<ProviderUserRef>;
  createRoom(input: {
    conversationId: string;
    topic: string;
    memberUserIds: string[];
  }): Promise<ProviderRoomRef>;
  inviteMember(input: { conversationId: string; userId: string }): Promise<void>;
  sendApprovedMessage(input: SendApprovedMessageInput): Promise<ProviderEventRef>;
  markRead(input: { conversationId: string; userId: string; providerEventId: string }): Promise<void>;
  loadTimeline(input: {
    conversationId: string;
    from?: string;
    limit: number;
  }): Promise<Array<{ providerEventId: string; senderUserId: string; body: string; createdAt: string }>>;
}
```

Initial implementations:

- `LocalMessagingProvider`: wraps the existing Postgres/SSE behavior.
- `MatrixMessagingProvider`: calls Synapse/appservice APIs.

The UI and mediation pipeline should depend on this interface, not on Matrix directly.

## Event Flow

### New Conversation

1. API creates `Conversation`.
2. API ensures Matrix users for creator and invitee when possible.
3. `MessagingProvider.createRoom` creates the Matrix room.
4. API stores `MatrixMapping`.
5. UI receives a normal USMender room snapshot.

### Draft To Approved Message

1. Client posts private draft to API.
2. API stores `PrivateDraft`.
3. API/worker creates `MediationJob`.
4. Worker retrieves room context from Matrix and USMender memory.
5. Worker creates `ApprovalPreview`.
6. Client shows preview in the composer.
7. User approves.
8. API writes local `MessageEvent`.
9. `MessagingProvider.sendApprovedMessage` posts to Matrix.
10. API stores Matrix event id.
11. Worker indexes the approved event.

### Incoming Matrix Event

This is only expected from trusted USMender paths at first.

1. Appservice receives event.
2. Appservice validates room mapping.
3. Appservice notifies API/worker.
4. Worker indexes the event if it is approved/shared content.
5. API updates read/inbox state.

## Draft Privacy

Raw drafts are never Matrix events. They live in USMender private storage with explicit retention controls.

Retention options:

- Delete raw draft immediately after approved message is sent.
- Keep raw draft for a short recovery window.
- Keep raw draft only for the author until manually cleared.

Default should be short retention, then deletion. Approved shared text and mediation metadata remain in the event ledger.

## Mobile Client Strategy

Phase 1:

- Ship the Next.js app as a PWA.
- Keep the thread and composer fully mobile-first.
- Use API snapshots/SSE or a Matrix-backed sync proxy instead of exposing raw Matrix UI.

Phase 2:

- Build `apps/ios` as a USMender client.
- Reuse USMender command APIs for drafts and approvals.
- Use Matrix only through USMender service APIs unless a native Matrix SDK is needed for push/sync performance.

Phase 3:

- Decide whether Android needs native work or whether the PWA is enough.

## Runtipi Deployment Notes

Target services:

- `web`
- `api`
- `worker`
- `postgres`
- `matrix-postgres`
- `matrix`
- `matrix-appservice`
- `cat`
- `cat-support`

Keep Matrix and helper databases internal by default. Expose only the USMender web UI unless a local Matrix admin/debug route is intentionally added.

## First Build Tasks

1. Add `packages/messaging-core` with the interface above.
2. Move existing Postgres/SSE posting into `LocalMessagingProvider`.
3. Add `Conversation`, `PrivateDraft`, `ApprovalPreview`, `MessageEvent`, and `MatrixMapping` models.
4. Add `worker` package and make mediation preview generation queueable.
5. Add Synapse and appservice compose stubs behind disabled/default-off env flags.
6. Implement `MatrixMessagingProvider` against local Synapse.
7. Switch the UI from session wording to room/conversation wording.
