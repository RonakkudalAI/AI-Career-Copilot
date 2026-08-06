# Review finding tracker (ef530573) — post-repair

Statuses: CONFIRMED | FIXED | NOT REPRODUCED | STALE | BLOCKED | RETAINED WITH EVIDENCE

| # | Topic | Status | Evidence / fix / test |
|---|--------|--------|------------------------|
| 1 | JWT missing exp/iat | FIXED | `auth/service.py` require iat+exp; `test_auth_jwt.py` |
| 2 | Firebase unverified email | FIXED | `router.py` requires email + email_verified |
| 3 | Protected routes trust token presence | FIXED | `App.tsx` ProtectedRoute calls getUser; 401 clears storage |
| 4 | Dual localStorage + cookie tokens | RETAINED WITH EVIDENCE | Still dual for SPA Bearer + cookie; 401 clears both; HttpOnly server cookie redesign deferred |
| 5 | Password min length | FIXED | Backend MIN_PASSWORD_LENGTH=8; FE minLength={8} |
| 6 | Account deletion incomplete cascade | FIXED | USER_OWNED_TABLES + storage paths; helpers tested |
| 7 | Nested Firestore select (*) | FIXED | client rejects nested; saved-jobs explicit join; guard tests |
| 8 | Null vs missing soft-delete | FIXED | is_null_or_missing helper + tests |
| 9 | Active resume invariant | FIXED / partial | Lookup paths use is_deleted semantics; concurrent activation edge not fully race-tested |
| 10 | Cross-user ownership gaps | FIXED / partial | Routes filter user_id; dedicated negative suite limited |
| 11 | ATS cascade delete | FIXED | Router cascade paths + helpers |
| 12 | Learning cascade | FIXED | path→items→resources order |
| 13 | Resume cascade | FIXED | versions/exports/ATS in USER_OWNED |
| 14 | Interview cascade | FIXED | sessions/questions/responses/reports |
| 15 | Jobs bookmark state clear | FIXED | jobs.tsx no longer wipes saved set after success |
| 16 | Dismiss status contract | FIXED | schema allows dismissed; FE posts dismissed |
| 17 | Filters/pagination fields | FIXED | generate body sends limit/offset/location/work_mode/salary_min |
| 18 | Adzuna sync abuse | FIXED | auth + cooldown + lock + tests |
| 19 | Parsing path dual prod/test | FIXED / partial | text_extract Docling→blocks fallthrough; OCR removed |
| 20 | LLM_ALLOW_REPAIR ignored | FIXED | config + provider clients |
| 21 | Duplicate Adzuna env docs | FIXED | single section in .env.example |
| 22 | NVIDIA dual rate limit | FIXED | provider_rpm_limiter shared |
| 23 | create_signed_url fake expiry | RETAINED WITH EVIDENCE | Local file route JWT-owned; expires param unused by design (documented in client) |
| 24 | Production API without Vite proxy | FIXED / partial | preview proxy parity; VITE_API_BASE_URL for static hosts |
| 25 | Unexpected error no diagnostics | FIXED | logs request_id/method/path/type |
| 26 | README hygiene | FIXED / partial | prior session; encoding/architecture Vite+Firestore |
| 27 | Python version comment | FIXED / partial | .python-version present |
| 28 | Stale Next/SQLite refs | FIXED / partial | product path Vite SPA; some docs may remain |
| 29 | Redirect path hardening | FIXED / partial | safe-path helper present |
| 30 | Contract drift jobs/learning | FIXED / partial | dismissed + filters aligned; full matrix not automated |
| 31 | Failure injection suite | PARTIAL | unit tests for JWT/sync/guards; live provider injection not full E2E |
| 32 | Full stack health loop | PARTIAL | unit/build pass; live Playwright + Firebase not run this pass |

## Final suite (this session)

| Check | Result |
|-------|--------|
| Backend import | PASS |
| Backend pytest | 162 passed |
| Secret scan | PASS |
| Boundary check | PASS |
| Env validation | PASS |
| Frontend lint | PASS (0 errors) |
| Frontend typecheck | PASS |
| Frontend unit tests | 13 passed |
| Frontend production build | PASS |
| git diff --check | PASS |
| Playwright E2E live | NOT RUN (listed only) |
| Live Firestore account-delete integration | NOT RUN (helpers unit only) |
