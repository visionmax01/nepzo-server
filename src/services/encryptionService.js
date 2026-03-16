import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const getEncryptionKey = () => {
  const key = env.encryption?.key;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return crypto.scryptSync(key.slice(0, 64), 'nepzo-salt', KEY_LENGTH);
};

/**
 * Encrypt a string. Returns base64-encoded: iv:authTag:encrypted
 */
export const encrypt = (plaintext) => {
  if (plaintext == null || plaintext === '') return plaintext;
  const text = String(plaintext);
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

/**
 * Decrypt a string encrypted with encrypt()
 */
export const decrypt = (encryptedBase64) => {
  if (encryptedBase64 == null || encryptedBase64 === '') return encryptedBase64;
  try {
    const key = getEncryptionKey();
    const buf = Buffer.from(encryptedBase64, 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) return encryptedBase64;
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return encryptedBase64;
  }
};

/**
 * Encrypt a buffer. Prepends iv:authTag to encrypted data.
 */
export const encryptBuffer = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) return buffer;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
};

/**
 * Decrypt a buffer encrypted with encryptBuffer()
 */
export const decryptBuffer = (encryptedBuffer) => {
  if (!encryptedBuffer || !Buffer.isBuffer(encryptedBuffer)) return encryptedBuffer;
  if (encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) return encryptedBuffer;
  try {
    const key = getEncryptionKey();
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    return encryptedBuffer;
  }
};

/**
 * Check if a string looks like our encrypted format (base64 with expected structure)
 */
export const isEncrypted = (str) => {
  if (typeof str !== 'string' || str.length < 40) return false;
  try {
    const buf = Buffer.from(str, 'base64');
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
};
