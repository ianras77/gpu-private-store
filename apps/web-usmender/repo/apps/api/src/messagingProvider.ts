import {
  LocalMessagingProvider,
  MatrixAppserviceProvider,
  type MessagingProvider
} from '@usmender/messaging-core';

type ProviderMode = 'local' | 'matrix';

function providerMode(): ProviderMode {
  return process.env.USMENDER_MESSAGING_PROVIDER === 'matrix' ? 'matrix' : 'local';
}

function parseTimeout(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let provider: MessagingProvider | null = null;

export function getMessagingProvider() {
  if (provider) {
    return provider;
  }

  if (providerMode() === 'matrix') {
    provider = new MatrixAppserviceProvider({
      baseUrl: process.env.MATRIX_APPSERVICE_URL ?? 'http://matrix-appservice:3002',
      token: process.env.MATRIX_APPSERVICE_TOKEN,
      timeoutMs: parseTimeout(process.env.MATRIX_APPSERVICE_TIMEOUT_MS, 8000)
    });
    return provider;
  }

  provider = new LocalMessagingProvider();
  return provider;
}

export function getMessagingProviderStatus() {
  const activeProvider = getMessagingProvider();
  return {
    provider: activeProvider.name,
    matrixEnabled: activeProvider.name === 'matrix',
    appserviceUrl:
      activeProvider.name === 'matrix'
        ? process.env.MATRIX_APPSERVICE_URL ?? 'http://matrix-appservice:3002'
        : null
  };
}
