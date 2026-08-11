# Nibgate Work Summary

## Objective
- Wallet Standard rollout is complete (committed, published, pushed).
- Current task: diagnosed and fixed the share cover-upload error "the string did not match the expected pattern". Fix applied, both frontends build green, e2e verified green, DB cleaned, not yet committed.

## Important Details
- "The string did not match the expected pattern" is NOT a backend/library validation message. It is **WebKit's generic `DOMException` SyntaxError** (DOM Exception 12, `SYNTAX_ERR`) — the exact string is defined in `Source/WebCore/dom/DOMException.cpp`. Safari/iOS WebKit throws it when a web-API string argument fails validation. In fetch code the classic trigger is `Response.json()` on a non-JSON body (HTML error/proxy page, redirect to login). Confirmed by: repo-wide grep (no literal in source), node_modules grep (absent from zod 4.4.3 / zod 3.22 / joi / prisma 5.22 runtime), MDN + TrackJS + StackOverflow.
- Root cause in our code: all five nibshare uploaders called `const res = await fetch(UPLOAD_URL,...); const data = await res.json(); if (!res.ok) throw ...` — `res.json()` runs before the `res.ok` check with no content-type guard, so any non-JSON response throws the WebKit SyntaxError and the `catch` shows that raw message to the user. (The nibshare API client `nibshareApi.request` uses `res.text()` + `JSON.parse`, so it was never affected.)
- Fix (hub): added `frontend/src/features/nibshare/lib/upload.ts` exporting `uploadJson<T = UploadResponse>(url, body)` — fetches with `credentials: "include"`, reads `res.text()`, parses defensively (try/catch → `{}`), and throws `data.error || "Upload failed"` when `!res.ok`. `UploadResponse = ContentMedia & { success?, encrypted?, error? }`. All five hub uploaders (`ImageUploader`, `AudioUploader`, `VideoUploader`, `DocumentUploader`, `MarkdownEditor`) now call it and dropped their local fetch/parse blocks. No remaining `await res.json()` in `frontend/src/features/nibshare/components/`.
- Fix (subblogs): subblogs had the SAME fragile pattern (`res.json()` before `res.ok`) in its five uploaders — near-identical copies. It rarely surfaced there because subblogs auths with `Authorization: Bearer <jwt>` (from localStorage `token`), and `middlewares/auth.js` on failure returns a JSON 401 via `next(new ApiError(...))` — never a redirect/HTML; its `upload.route.js` also always answers JSON. The hub is cookie-auth (`credentials: "include"`), so session expiry follows a redirect to an HTML page → the exact WebKit trigger. Applied the same fix: added `subblogs/frontend/src/lib/upload.ts` exporting `uploadJson<T = UploadResult>(url, body, headers?)` (Bearer header preserved), migrated all five subblogs uploaders. `UploadResult` has `storageRef?`/`encryptedKey?` typed `string` (not `null`) to satisfy the subblogs `onUpload` prop types.
- Also verified earlier: hub `requireAuth` in `packages/internal/src/auth.js:135` returns JSON 401 (not HTML), and `upload-routes.js` always responds JSON — so the non-JSON body came from an edge/proxy/error layer, not the Express routes.
- Note: `frontend/src/app/dashboard/*` pages still use bare `res.json()` in places but with `if (contentType.includes("application/json"))` guards (analytics/earnings/contents) or read-only GET endpoints (dashboard/profile uses `/uploads/profile-image` with `res.json()` after POST — same theoretical exposure, low priority). Same for `subblogs/frontend/src/components/NibgateUnlock.tsx:93,164` (read-only media fetches).
- Wallet rollout facts (prior work): `@nibgate/wallet@0.1.0` + `@nibgate/sdk@0.4.5` published; committed `6aac19c` pushed to `origin/main` (`git@github.com:fortunesayspump/nibgate.git`); all §4 steps 1–6 done; shared relay/gateway-balance in `packages/internal/src/payments.js`.
- E2E finding (resolved): the in-repo e2e (`scripts/e2e-nibgate-flow.mjs`) previously FAILED at "E2E signed rating was not recorded." NOT a backend regression — the signed rating WAS recorded (`ContentRating` row `status: accepted`, `proof: signed:0x...`). The e2e assertion was stale vs. the deliberate onchain-only rating policy from commit `3349bb2` ("count only verified circle-gateway receipts and on-chain ratings everywhere"): `serializeContent` (helpers.js:912) only counts `proof` starting with `onchain:`, and `hub/monitors.js:251` rejects non-`onchain:` ratings. Fixed the e2e to assert the signed rating is recorded in the DB but excluded from public `ratings`/`reputationStars`. Re-run: **e2e passes** (ok:true, ratings:0, reputationStars:null).

## Work State
### Completed
- Diagnosed the Safari cover-upload error to its exact source (WebKit DOMException SyntaxError / `Response.json()` on non-JSON), confirmed no repo/node_modules string matches.
- Added `frontend/src/features/nibshare/lib/upload.ts` (`uploadJson` helper) and migrated all five share uploaders to it. Same for subblogs (`subblogs/frontend/src/lib/upload.ts` + five uploaders).
- Verified: `pnpm --filter @nibgate/frontend build` passes AND `subblogs/frontend` `npm run build` passes (TypeScript + Next clean).
- SDK tests pass (`pnpm --filter @nibgate/sdk test`, 18/18). Temp `upload-json.test.js` (6 vitest tests importing the real helper files) proved the fix against non-JSON bodies — removed after verification.
- Live local backend boot verified upload routes always answer JSON (401 from `requireAuth`). Local Postgres `nibgate_hub` up.
- Investigated the in-repo e2e failure — NOT a regression, stale assertion vs `3349bb2` onchain-only policy (see Important Details). Updated `scripts/e2e-nibgate-flow.mjs:166` to assert signed rating recorded in DB but excluded from public reputation; re-run **passes**.
- Cleaned local Postgres: removed e2e site/content/ratings/receipts/metrics/user rows. Removed temp artifacts (`backend/boot-temp.mjs`, `packages/nibgate/test/upload-json.test.js`, `/tmp/fake.png`, log).

### Active
- (none — fix is in; awaiting user decision on commit/deploy)

### Blocked
- (none)

## Next Move
1. Offer to commit (suggested message: `fix(share): harden upload responses against non-JSON bodies (Safari SyntaxError)`). Now includes the `scripts/e2e-nibgate-flow.mjs` assertion fix; AGENTS.md updated (uncommitted). Per policy, do not commit unless asked.
2. Optional: apply the same defensive parse to `frontend/src/app/dashboard/profile/page.tsx:134` (`/uploads/profile-image`) and other bare `res.json()` spots if the user wants full coverage.
3. (Wallet rollout recap, previously established): everything wallet-side is now on the standard — hub SIWE sign-in, SDK unlock/rating embeds, subblogs `GatewayWallet`, widget.js, shared relays — via published `@nibgate/wallet@0.1.0` + `@nibgate/sdk@0.4.5`.

## Relevant Files
- `frontend/src/features/nibshare/lib/upload.ts` — NEW shared `uploadJson` helper (defensive text→parse, throws `data.error`).
- `frontend/src/features/nibshare/components/ImageUploader.tsx` (cover), `AudioUploader.tsx`, `VideoUploader.tsx`, `DocumentUploader.tsx`, `MarkdownEditor.tsx` — migrated to `uploadJson`.
- `frontend/src/features/nibshare/api.ts` — `nibshareApi.request` already text/parse-safe (reference pattern).
- `frontend/src/features/nibshare/types.ts:120` — `ContentMedia` type used by `UploadResponse`.
- `backend/src/server/routes/upload-routes.js` — `/uploads/profile-image` (line 87), `/uploads/content` (line 124); always JSON.
- `packages/internal/src/auth.js:135` — `requireAuth` 401 JSON.
