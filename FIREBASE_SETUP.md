# Firebase setup (Firestore + Supabase Storage)

Current architecture: Firebase provides Firestore and Google Authentication. Supabase Storage provides private file storage for resumes, avatars, and exports. Interview video/audio is not stored; only interview answers and generated reports are persisted.

Career Copilot stores **all durable application data in Firebase**:

| Data | Backend | Path |
|------|---------|------|
| Users, profiles, resumes, ATS, jobs, learning, interviews | **Cloud Firestore** | collections via Admin SDK |
| Resume files, avatars, exports | **Supabase Storage** | private objects under logical prefixes |
| Google sign-in | **Firebase Authentication** | ID token verified by Admin SDK |

There is **no product local SQL/SQLite database**. Browser clients never read Firestore or Supabase Storage directly.

## 1. Create / select a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Create or select a project.
3. Note the **Project ID** (used as `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID`).

## 2. Cloud Firestore

1. Build → Firestore Database → Create database.
2. Start in **production mode** (rules deny all client access; the API uses Admin SDK).
3. Choose a region.
4. Optional named database: set `FIREBASE_DATABASE_ID` (default `(default)`).

Deploy deny-all rules from this repo:

```text
firebase/firestore.rules
```

## 3. Supabase Storage

1. Build → Storage → Get started.
2. Use the default bucket (often `YOUR_PROJECT_ID.appspot.com` or `YOUR_PROJECT_ID.firebasestorage.app`).
3. Set in root `.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=career-copilot-files
```

Logical prefixes (not separate Supabase buckets):

| Env | Purpose |
|-----|---------|
| `DOCUMENT_BUCKET` | resumes / exports (`candidate-documents` by default) |
| `AVATAR_BUCKET` | profile pictures |

Object keys look like:

```text
{DOCUMENT_BUCKET}/{user_id}/...
```

Supabase Storage remains private; the FastAPI server uses the service-role key and enforces JWT ownership before downloads.

## 4. Service account (server only)

1. Project settings → Service accounts → Generate new private key.
2. Save JSON **outside git** (this repo uses `./secrets/...` which must stay ignored).
3. Set:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CREDENTIALS_PATH=./secrets/your-service-account.json
```

Grant the service account access to **Firestore** and **Storage** for that project.

## 5. Web app config (browser Google sign-in only)

Project settings → Your apps → Web app. Copy into `.env`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...   # must match FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Enable **Google** under Authentication → Sign-in method.  
Add authorized domains for your frontend host.

## 6. Verify

```bash
# from repo root, with backend venv available
node scripts/setup/firebase.mjs
# or
cd backend && .venv/Scripts/python.exe ../scripts/diagnostics/check-firestore.py
```

Expected: Firestore write/read/cleanup **and** Storage write/read/cleanup pass.

API health:

- `GET /api/v1/health` → `database_engine: firestore`, `storage_engine: firebase_storage`
- `GET /api/v1/health/database` → `engine: firestore`

## Architecture note

- FastAPI is the only process that uses the Admin SDK.
- App sessions after sign-in are **HS256 JWTs** (`AUTH_SECRET`); user rows still live in Firestore `users`.
- File downloads go through `GET /api/v1/files/{bucket}/{path}` with JWT ownership checks; bytes are loaded from Firebase Storage.
