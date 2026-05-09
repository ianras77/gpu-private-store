import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENCRYPTION_PREFIX = 'enc:v1';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function isEncryptionEnabled() {
  return process.env.ENABLE_DB_ENCRYPTION === 'true';
}

function getConfiguredKey() {
  const encodedKey = process.env.DATA_ENCRYPTION_KEY;
  if (!encodedKey) {
    return null;
  }

  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }

  return key;
}

function getRequiredKey() {
  const key = getConfiguredKey();
  if (!key) {
    throw new Error('DATA_ENCRYPTION_KEY is required when encrypted data is stored.');
  }
  return key;
}

export function encryptStoredText(value: string) {
  if (!isEncryptionEnabled()) {
    return value;
  }

  const key = getRequiredKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

export function decryptStoredText(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return value;
  }

  const [, , iv, tag, encrypted] = value.split(':');
  if (!iv || !tag || !encrypted) {
    throw new Error('Encrypted value is malformed.');
  }

  const key = getRequiredKey();
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
