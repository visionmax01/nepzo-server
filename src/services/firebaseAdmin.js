import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const getServiceAccountPath = () => {
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (envPath) {
    return resolve(process.cwd(), envPath);
  }
  return join(__dirname, '../certs/nepzo-21619-firebase-adminsdk.json');
};

let initialized = false;

const ensureInitialized = () => {
  if (initialized) return;
  const path = getServiceAccountPath();
  const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  initialized = true;
};

export const getMessaging = () => {
  ensureInitialized();
  return admin.messaging();
};
