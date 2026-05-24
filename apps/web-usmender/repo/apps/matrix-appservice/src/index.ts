import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type StoredUser = {
  localUserId: string;
  providerUserId: string;
  displayName: string;
};

type StoredEvent = {
  localEventId: string;
  providerEventId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  metadata: unknown;
};

type StoredRoom = {
  localConversationId: string;
  providerRoomId: string;
  topic: string;
  memberUserIds: string[];
  events: StoredEvent[];
};

type State = {
  users: Record<string, StoredUser>;
  rooms: Record<string, StoredRoom>;
};

const port = Number(process.env.PORT ?? 3002);
const statePath = process.env.MATRIX_APPSERVICE_STATE_PATH ?? '/data/state.json';
const appserviceToken = process.env.MATRIX_APPSERVICE_TOKEN;
const serverName = process.env.MATRIX_SERVER_NAME ?? 'usmender.local';
const homeserverUrl = process.env.MATRIX_HOMESERVER_URL?.replace(/\/$/, '');
const homeserverToken = process.env.MATRIX_ACCESS_TOKEN;

function emptyState(): State {
  return { users: {}, rooms: {} };
}

function loadState(): State {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as State;
  } catch {
    return emptyState();
  }
}

let state = loadState();

function saveState() {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function sendJson(reply: ServerResponse, statusCode: number, body: unknown) {
  reply.writeHead(statusCode, { 'Content-Type': 'application/json' });
  reply.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function authorize(request: IncomingMessage) {
  if (!appserviceToken) {
    return true;
  }
  return request.headers.authorization === `Bearer ${appserviceToken}`;
}

function matrixSafeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._=-]/g, '_');
}

function providerUserId(localUserId: string) {
  return `@usmender_${matrixSafeId(localUserId)}:${serverName}`;
}

function mockRoomId(conversationId: string) {
  return `!usmender_${matrixSafeId(conversationId)}:${serverName}`;
}

function mockEventId(localEventId: string) {
  return `$usmender_${matrixSafeId(localEventId)}:${serverName}`;
}

async function homeserverRequest<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  if (!homeserverUrl || !homeserverToken) {
    return null;
  }

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${homeserverToken}`,
      'Content-Type': 'application/json'
    }
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${homeserverUrl}${path}`, init);

  if (!response.ok) {
    throw new Error(`Synapse ${method} ${path} failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as T;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ensureUser(input: { userId: string; displayName: string }) {
  const existing = state.users[input.userId];
  if (existing) {
    return existing;
  }

  const user = {
    localUserId: input.userId,
    providerUserId: providerUserId(input.userId),
    displayName: input.displayName
  };
  state.users[input.userId] = user;
  saveState();
  return user;
}

async function ensureRoom(input: {
  conversationId: string;
  topic: string;
  memberUserIds: string[];
}) {
  const existing = state.rooms[input.conversationId];
  if (existing) {
    return existing;
  }

  let created: { room_id: string } | null = null;
  try {
    created = await homeserverRequest<{ room_id: string }>('POST', '/_matrix/client/v3/createRoom', {
      name: input.topic,
      preset: 'private_chat',
      visibility: 'private'
    });
  } catch (error) {
    console.warn(
      '[matrix-appservice] Synapse room create failed for ' +
        input.conversationId +
        '; using local mirror: ' +
        describeError(error)
    );
  }

  const room = {
    localConversationId: input.conversationId,
    providerRoomId: created?.room_id ?? mockRoomId(input.conversationId),
    topic: input.topic,
    memberUserIds: input.memberUserIds,
    events: []
  };
  state.rooms[input.conversationId] = room;
  saveState();
  return room;
}

async function route(request: IncomingMessage, reply: ServerResponse) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const method = request.method ?? 'GET';

  if ((url.pathname === '/health' || url.pathname === '/healthz') && method === 'GET') {
    sendJson(reply, 200, {
      ok: true,
      mode: homeserverUrl && homeserverToken ? 'synapse' : 'mock',
      rooms: Object.keys(state.rooms).length,
      users: Object.keys(state.users).length
    });
    return;
  }

  if (!authorize(request)) {
    sendJson(reply, 401, { error: 'Unauthorized' });
    return;
  }

  if (url.pathname === '/v0/users/ensure' && method === 'POST') {
    const body = await readJson(request);
    const user = ensureUser({
      userId: String(body.userId ?? ''),
      displayName: String(body.displayName ?? 'USMender user')
    });
    sendJson(reply, 200, user);
    return;
  }

  if (url.pathname === '/v0/rooms' && method === 'POST') {
    const body = await readJson(request);
    const memberUserIds = Array.isArray(body.memberUserIds)
      ? body.memberUserIds.map((value) => String(value))
      : [];
    const room = await ensureRoom({
      conversationId: String(body.conversationId ?? ''),
      topic: String(body.topic ?? 'USMender room'),
      memberUserIds
    });
    sendJson(reply, 200, {
      localConversationId: room.localConversationId,
      providerRoomId: room.providerRoomId
    });
    return;
  }

  if (url.pathname === '/v0/rooms/invite' && method === 'POST') {
    const body = await readJson(request);
    const conversationId = String(body.conversationId ?? '');
    const userId = String(body.userId ?? '');
    const room = await ensureRoom({
      conversationId,
      topic: 'USMender room',
      memberUserIds: [userId]
    });
    if (!room.memberUserIds.includes(userId)) {
      room.memberUserIds.push(userId);
    }
    const user = state.users[userId] ?? ensureUser({ userId, displayName: 'USMender user' });
    try {
      await homeserverRequest('POST', `/_matrix/client/v3/rooms/${encodeURIComponent(room.providerRoomId)}/invite`, {
        user_id: user.providerUserId
      });
    } catch (error) {
      console.warn(
        '[matrix-appservice] Synapse invite failed for ' +
          conversationId +
          '/' +
          userId +
          '; keeping local mirror membership: ' +
          describeError(error)
      );
    }
    saveState();
    sendJson(reply, 200, { ok: true });
    return;
  }

  if (url.pathname === '/v0/messages/approved' && method === 'POST') {
    const body = await readJson(request);
    const conversationId = String(body.conversationId ?? '');
    const localEventId = String(body.localEventId ?? '');
    const authorUserId = String(body.authorUserId ?? '');
    const approvedText = String(body.approvedText ?? '');
    const room = await ensureRoom({
      conversationId,
      topic: 'USMender room',
      memberUserIds: [authorUserId]
    });

    let created: { event_id: string } | null = null;
    try {
      created = await homeserverRequest<{ event_id: string }>(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(room.providerRoomId)}/send/m.room.message/${encodeURIComponent(localEventId)}`,
        {
          msgtype: 'm.text',
          body: approvedText,
          usmender: body.metadata ?? {}
        }
      );
    } catch (error) {
      console.warn(
        '[matrix-appservice] Synapse message send failed for ' +
          conversationId +
          '/' +
          localEventId +
          '; keeping local mirror event: ' +
          describeError(error)
      );
    }

    const event = {
      localEventId,
      providerEventId: created?.event_id ?? mockEventId(localEventId),
      senderUserId: authorUserId,
      body: approvedText,
      createdAt: new Date().toISOString(),
      metadata: body.metadata ?? {}
    };
    room.events.push(event);
    saveState();
    sendJson(reply, 200, {
      localEventId,
      providerEventId: event.providerEventId,
      providerRoomId: room.providerRoomId
    });
    return;
  }

  if (url.pathname === '/v0/read' && method === 'POST') {
    await readJson(request);
    sendJson(reply, 200, { ok: true });
    return;
  }

  const timelineMatch = url.pathname.match(/^\/v0\/rooms\/([^/]+)\/timeline$/);
  if (timelineMatch && method === 'GET') {
    const conversationId = decodeURIComponent(timelineMatch[1] ?? '');
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 50), 100));
    const events = (state.rooms[conversationId]?.events ?? []).slice(-limit).map((event) => ({
      providerEventId: event.providerEventId,
      senderUserId: event.senderUserId,
      body: event.body,
      createdAt: event.createdAt
    }));
    sendJson(reply, 200, { events });
    return;
  }

  sendJson(reply, 404, { error: 'Not found' });
}

createServer((request, reply) => {
  route(request, reply).catch((error) => {
    sendJson(reply, 500, { error: error instanceof Error ? error.message : String(error) });
  });
}).listen(port, () => {
  console.log(`USMender Matrix appservice listening on ${port}`);
});
