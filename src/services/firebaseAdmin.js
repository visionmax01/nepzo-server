import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const getServiceAccount = () => {
  // Option 1: JSON from env (base64) - for Docker/production where cert file is not in image
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
  if (b64 && typeof b64 === 'string') {
    try {
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return json;
    } catch (e) {
      throw e;
    }
  }

  // Option 2: File path (local dev)
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const path = envPath ? resolve(process.cwd(), envPath) : join(__dirname, '../certs/nepzo-21619-firebase-adminsdk.json');
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  throw new Error(`[Firebase] Service account not found. Set FIREBASE_SERVICE_ACCOUNT_JSON_B64 (base64) or FIREBASE_SERVICE_ACCOUNT_PATH. See server/src/certs/README-FIREBASE.md`);
};

let initialized = false;

const ensureInitialized = () => {
  if (initialized) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  initialized = true;
};

export const getMessaging = () => {
  ensureInitialized();
  return admin.messaging();
};
