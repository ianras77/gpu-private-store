import type { FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export type MessageApprovalTokenPayload = {
  typ: 'usmender:message-preview';
  previewId: string;
  sessionId: string;
  userId: string;
  sessionRevision: number;
  content: string;
  moderatedText: string;
  recipientView: string;
  coachNote: string;
  latestOtherSummary: string | null;
  latestMediatorPrompt: string | null;
  approvalChecklist: string[];
  followUpQuestion: string | null;
};

export type SessionStreamTokenPayload = {
  typ: 'usmender:session-stream';
  sessionId: string;
  userId: string;
};

export class AuthError extends Error {
  statusCode = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function signMessageApprovalToken(
  payload: Omit<MessageApprovalTokenPayload, 'typ'>
) {
  return jwt.sign(
    {
      typ: 'usmender:message-preview',
      ...payload
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function verifyMessageApprovalToken(token: string) {
  let payload: MessageApprovalTokenPayload | null = null;
  try {
    payload = jwt.verify(token, JWT_SECRET) as MessageApprovalTokenPayload;
  } catch {
    throw new AuthError('Preview approval expired. Refresh the preview and try again.');
  }

  if (!payload || payload.typ !== 'usmender:message-preview') {
    throw new AuthError('Preview approval is invalid. Refresh the preview and try again.');
  }

  return payload;
}

export function signSessionStreamToken(payload: Omit<SessionStreamTokenPayload, 'typ'>) {
  return jwt.sign(
    {
      typ: 'usmender:session-stream',
      ...payload
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

export function verifySessionStreamToken(token: string) {
  let payload: SessionStreamTokenPayload | null = null;
  try {
    payload = jwt.verify(token, JWT_SECRET) as SessionStreamTokenPayload;
  } catch {
    throw new AuthError('Room stream expired. Refresh the room and reconnect.');
  }

  if (!payload || payload.typ !== 'usmender:session-stream') {
    throw new AuthError('Room stream token is invalid.');
  }

  return payload;
}

export async function requireAuth(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthError();
  }

  const token = header.slice('Bearer '.length);
  let payload: { sub?: string } | null = null;
  try {
    payload = jwt.verify(token, JWT_SECRET) as { sub?: string };
  } catch {
    throw new AuthError();
  }

  if (!payload?.sub) {
    throw new AuthError();
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AuthError();
  }

  return user;
}
