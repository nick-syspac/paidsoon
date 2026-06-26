## 1. Implementation

- [x] 1.1 Modify `/auth/sign-out/route.ts` to redirect to homepage after logout
- [x] 1.2 Ensure session is cleared before redirecting (Supabase signOut is called)
- [x] 1.3 Update any middleware or auth context if needed to handle new redirect

## 2. Testing

- [x] 2.1 Test logout flow locally: click logout button and verify redirect to homepage
- [x] 2.2 Verify user cannot access protected routes after logout without re-authentication
- [x] 2.3 Test direct access to `/auth/sign-out` endpoint while authenticated
- [x] 2.4 Test logout when already logged out (edge case)

## 3. Verification

- [x] 3.1 Verify homepage loads correctly after redirect
- [x] 3.2 Verify session/auth state is properly cleared (check browser storage, cookies)
- [x] 3.3 Test in staging environment before production deployment

## 4. Deployment

- [x] 4.1 Deploy to production
- [x] 4.2 Smoke test logout flow in production
