export function serverApiBase(): string {
  return process.env.API_PROXY_TARGET || 'http://localhost:8000';
}

export function publicApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || '/api';
}
