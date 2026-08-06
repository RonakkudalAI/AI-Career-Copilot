# Feature: Authentication & account lifecycle

## Purpose

Identify the candidate, issue a trusted app JWT, and enforce ownership on every protected mutation. Optional Google sign-in exchanges a Firebase ID token for the same app JWT.

## Why this design

| Choice | Why |
|--------|-----|
| App JWT (not Firebase ID token for API) | Stable API auth even when Google is off; server owns claims |
| scrypt passwords | Memory-hard local password storage without external IdP for email/password |
| Bearer + cookie | SPA fetch + simple cookie-based fallback |
| Deny-all Firestore rules | Prevent browser from bypassing ownership |

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/features/auth/service.py` | `CurrentUser`, JWT create/decode, `get_current_user` |
| `backend/app/features/auth/account_deletion.py` | Confirm phrase, storage purge, cascade tables |
| `backend/app/api/router.py` | `/auth/*`, scrypt helpers, signup graph, `DELETE /account` |
| `backend/app/core/constants.py` | `JWT_ALGORITHM`, `MIN_PASSWORD_LENGTH` (8) |
| `frontend/src/features/auth/api/client.ts` | Sign-in/up, token persistence |
| `frontend/src/features/auth/components/auth-screen.tsx` | Screens |
| `frontend/src/features/auth/firebase.ts` | Google Web SDK |
| `frontend/src/features/auth/demo-session.ts` | Offline demo |
| `frontend/src/features/auth/safe-path.ts` | Safe `next` redirect |
| `frontend/src/App.tsx` | `ProtectedRoute` |

## Password storage

Implemented in `api/router.py`:

```text
scrypt(password, salt, n=2**14, r=8, p=1)
stored as: scrypt${salt_hex}${digest_hex}
verify: recompute + hmac.compare_digest
```

Min length: `MIN_PASSWORD_LENGTH` from `core/constants.py`.

## JWT

```text
create_access_token(user_id, email, settings)
  payload: sub, email, iat, exp (TTL = jwt_ttl_seconds, default 7d)
  sign: AUTH_SECRET, HS256
```

`get_current_user`:

1. Prefer `Authorization: Bearer`  
2. Else cookie `career_copilot_session`  
3. Decode with required `sub`, `exp`, `iat`  
4. Load `users` row off the event loop (`asyncio.to_thread`)  
5. Return `CurrentUser`

## Sign-up graph

`_create_user_records` inserts:

1. `users`  
2. `profiles`  
3. `candidate_preferences`  
4. `notification_preferences`  
5. `privacy_preferences`  

On child failure: reverse-delete created children + user (compensating transaction style).

## Frontend token storage

`saveToken` in `features/auth/api/client.ts`:

- `localStorage[career_copilot_access_token]`  
- cookie `career_copilot_session` Path=/ SameSite=Lax  

## Account deletion

```text
DELETE /account
  confirmation_phrase == "DELETE MY ACCOUNT"
  optional email must match
  → collect storage paths
  → purge Storage
  → delete USER_OWNED_TABLES then user/profile
```

Cascade order: `features/auth/account_deletion.py` → `USER_OWNED_TABLES`.

## Related flows

See [flows.md §1–2, §11](../flows.md).  
