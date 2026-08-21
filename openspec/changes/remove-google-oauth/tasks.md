# Tasks: Remove Google OAuth from Auth Screens

## [x] Task 1 — Remove Google OAuth from sign-in page

**File:** `app/(auth)/sign-in/page.tsx`

- Remove the `handleGoogleSignIn` async function (including its trace calls and `persistClientTraceCookie` call).
- Remove the `createClient` import if it is no longer referenced.
- Remove the Google button JSX (`<button onClick={handleGoogleSignIn}>…</button>`).
- Remove the "or" divider JSX (`<div className="flex items-center gap-3 …">…</div>`).

**Acceptance criteria:**
- The sign-in page renders only the email/password form and the Turnstile widget.
- No TypeScript errors.
- `persistClientTraceCookie`, `traceClientEvent`, `traceRequestHeaders`, and `updateClientTraceStateFromResponse` imports are retained (still used by email sign-in).

---

## [x] Task 2 — Remove Google OAuth from sign-up page

**File:** `app/(auth)/sign-up/page.tsx`

- Remove the `handleGoogleSignUp` async function.
- Remove the `createClient` import if it is no longer referenced.
- Remove the Google button JSX (`<button onClick={handleGoogleSignUp}>…</button>`).
- Remove the "or" divider JSX (`<div className="flex items-center gap-3 …">…</div>`).

**Acceptance criteria:**
- The sign-up page renders only the email/password form and the Turnstile widget.
- No TypeScript errors.
- `npm run build` passes with no type errors across both files.
