import { EventEmitter } from 'node:events';

type SessionUpdateEvent = {
  sessionId: string;
  reason: string;
};

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publishSessionUpdate(sessionId: string, reason = 'updated') {
  emitter.emit(sessionId, { sessionId, reason } satisfies SessionUpdateEvent);
}

export function subscribeSessionUpdate(
  sessionId: string,
  listener: (event: SessionUpdateEvent) => void
) {
  emitter.on(sessionId, listener);

  return () => {
    emitter.off(sessionId, listener);
  };
}
