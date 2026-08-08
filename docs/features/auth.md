# Auth — how it works

**Canonical overview:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.1.

## Goal

Issue a short-lived **app JWT** that FastAPI trusts for every product call. Firebase is an identity front-end (email/password + Google), not the long-term API credential.

## Password (backend-native)

| Step | Implementation |
|------|----------------|
| Sign-up | `POST /auth/sign-up` → scrypt hash → `users` + `profiles` + preference rows |
| Sign-in | `POST /auth/sign-in` → verify scrypt → JWT |
| Update password | Requires current password when a hash exists |

Hash format: `scrypt$salt_hex$digest_hex` with `n=2**14, r=8, p=1`.

## Firebase (frontend primary)

1. Web SDK signs the user in (`features/auth/firebase.ts`).  
2. Client sends Firebase ID token to `POST /auth/firebase`.  
3. Admin SDK verifies (optional revocation check).  
4. Server links or creates user by verified email + `firebase_uid`.  
5. Server returns app JWT.

**Safety:** will not silently attach Google identity onto an existing password account for the same email.

**Frontend fallback:** if Firebase email sign-in fails with credential errors, client tries legacy `POST /auth/sign-in`.

## Session on the client

| Storage | Key |
|---------|-----|
| localStorage | `career_copilot_access_token` |
| Cookie | `career_copilot_session` (for authenticated file GETs) |

`apiRequest` sends `Authorization: Bearer …` and `credentials: "include"`. On 401 it clears storage and dispatches `career-copilot:auth-expired`.

## Account deletion

`DELETE /account` with body confirmation phrase **`DELETE MY ACCOUNT`** and matching email → purge storage objects → delete user-owned tables → profile → user (`features/auth/account_deletion.py`).

## Key files

- `backend/app/api/routers/auth.py`  
- `backend/app/features/auth/service.py`  
- `backend/app/features/auth/account_deletion.py`  
- `frontend/src/features/auth/*`
