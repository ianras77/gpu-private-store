import { describe, expect, it } from 'vitest';
import {
  ALL_EVENTS,
  ALL_STATUSES,
  SESSION_EVENT,
  SESSION_STATUS,
  transition,
  type SessionEventType,
  type SessionStatus
} from '../src/stateMachine';

const EXPECTED: Record<SessionStatus, Partial<Record<SessionEventType, SessionStatus>>> = {
  DRAFT: {
    SUBMIT_NEED: SESSION_STATUS.INVITE_READY
  },
  INVITE_READY: {
    SEND_INVITE: SESSION_STATUS.INVITED
  },
  INVITED: {
    INVITE_ACCEPTED: SESSION_STATUS.ACTIVE_INTAKE,
    INVITE_DECLINED: SESSION_STATUS.CLOSED_NO_AGREEMENT,
    INVITE_EXPIRED: SESSION_STATUS.CLOSED_NO_AGREEMENT
  },
  ACTIVE_INTAKE: {
    INTAKE_COMPLETE: SESSION_STATUS.PROPOSAL_V1
  },
  PROPOSAL_V1: {
    PROPOSAL_READY: SESSION_STATUS.VOTING_V1
  },
  VOTING_V1: {
    VOTE_ALL_YES: SESSION_STATUS.AGREED,
    VOTE_NEEDS_CHANGES: SESSION_STATUS.REFINEMENT
  },
  REFINEMENT: {
    REFINEMENT_DONE: SESSION_STATUS.PROPOSAL_V2
  },
  PROPOSAL_V2: {
    PROPOSAL_V2_READY: SESSION_STATUS.VOTING_V2
  },
  VOTING_V2: {
    VOTE_ALL_YES: SESSION_STATUS.AGREED,
    VOTE_NOT_AGREED: SESSION_STATUS.CLOSED_NO_AGREEMENT
  },
  AGREED: {},
  CLOSED_NO_AGREEMENT: {},
  ABORTED_SAFETY: {}
};

const GLOBAL: Partial<Record<SessionEventType, SessionStatus>> = {
  EXIT: SESSION_STATUS.CLOSED_NO_AGREEMENT,
  SAFETY_ABORT: SESSION_STATUS.ABORTED_SAFETY
};

describe('state machine transitions', () => {
  for (const status of ALL_STATUSES) {
    for (const event of ALL_EVENTS) {
      it(`from ${status} on ${event}`, () => {
        const expected = GLOBAL[event] ?? EXPECTED[status]?.[event];
        if (expected) {
          expect(transition(status, { type: event })).toBe(expected);
        } else {
          expect(() => transition(status, { type: event })).toThrowError();
        }
      });
    }
  }
});

it('sanity check: all events are covered', () => {
  expect(ALL_EVENTS).toEqual(Object.values(SESSION_EVENT));
});
