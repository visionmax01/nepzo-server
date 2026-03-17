# Firebase Service Account for Push Notifications

The server uses Firebase Admin SDK to send push notifications. You must add a service account for the **nepzo-21619** project (must match `mobile/google-services.json`).

## Setup (choose one)

### Option A: Local dev (file path)

1. Go to [Firebase Console](https://console.firebase.google.com/) → project **nepzo-21619**
2. Project Settings → **Service accounts** → **Generate new private key**
3. Save as `server/src/certs/nepzo-21619-firebase-adminsdk.json`
4. `.env`: `FIREBASE_SERVICE_ACCOUNT_PATH=./src/certs/nepzo-21619-firebase-adminsdk.json`

### Option B: Production / Docker (base64 env)

1. Download the service account JSON (same as above)
2. Base64 encode it:
   ```bash
   # Linux/Mac
   base64 -w 0 nepzo-21619-firebase-adminsdk.json
   ```
3. Add to `.env` on EC2:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON_B64=<paste_base64_output_here>
   ```

## Production APK: Add SHA-1 and SHA-256

**Required for FCM to work with production builds.** EAS uses a different signing key than debug.

1. Get your production signing fingerprints:
   ```bash
   eas credentials --platform android
   ```
   Or from EAS dashboard: Project → Credentials → Android → Production signing key

2. Firebase Console → Project Settings → Your Android app → **Add fingerprint**
   - Add SHA-1
   - Add SHA-256

3. Rebuild APK after adding fingerprints.

**Note:** Do not commit the service account JSON. It is in `.gitignore`.
