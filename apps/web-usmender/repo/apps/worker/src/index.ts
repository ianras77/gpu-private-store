import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3003);
const startedAt = new Date();
const provider = process.env.USMENDER_MESSAGING_PROVIDER ?? 'local';
const workerMode = process.env.USMENDER_WORKER_MODE ?? 'inline-ready';

function sendJson(statusCode: number, body: unknown, reply: import('node:http').ServerResponse) {
  reply.writeHead(statusCode, { 'Content-Type': 'application/json' });
  reply.end(JSON.stringify(body));
}

createServer((request, reply) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health' || url.pathname === '/healthz') {
    sendJson(
      200,
      {
        ok: true,
        service: 'usmender-worker',
        version: '0.5.0',
        mode: workerMode,
        messagingProvider: provider,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000)
      },
      reply
    );
    return;
  }

  if (url.pathname === '/v0/jobs' && request.method === 'GET') {
    sendJson(
      200,
      {
        jobs: [],
        note: 'v0.5 keeps mediation inline in the API while the worker service is deployed and health-checkable.'
      },
      reply
    );
    return;
  }

  sendJson(404, { error: 'Not found' }, reply);
}).listen(port, () => {
  console.log(`USMender worker listening on ${port}`);
});
