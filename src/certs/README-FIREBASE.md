# Firebase Service Account for Push Notifications

The server uses Firebase Admin SDK to send push notifications. You must add a service account JSON file for the **nepzo-21619** project (must match `mobile/google-services.json`).

## Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) and select project **nepzo-21619**
2. Project Settings (gear icon) → **Service accounts** tab
3. Click **Generate new private key**
4. Save the downloaded JSON file as:
   ```
   server/src/certs/nepzo-21619-firebase-adminsdk.json
   ```
5. Ensure `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env` points to this file (default: `./src/certs/nepzo-21619-firebase-adminsdk.json`)

**Note:** Do not commit the service account JSON to version control. Add it to `.gitignore`.
