## Context

The logout endpoint at `/auth/sign-out/route.ts` currently uses Supabase's default signOut behavior, which redirects users back to the sign-in page. The UX is improved by redirecting to the main homepage instead, giving users a clear entry point and better closure to their session.

## Goals / Non-Goals

**Goals:**
- Redirect users to the main homepage after logout
- Maintain session security (no changes to auth mechanism)
- Provide a consistent exit experience

**Non-Goals:**
- Change the logout mechanism itself
- Add additional pages or routes
- Modify authentication flow or security

## Decisions

**Decision 1: Server-side redirect via Next.js route handler**

The logout handler will explicitly redirect to `/` using Next.js `redirect()` or `NextResponse.redirect()` after clearing the session.

- **Why**: Simple, secure, no client-side logic needed
- **Alternatives**: 
  - Client-side redirect (less reliable, no guarantee of execution order)
  - Redirect to a custom logout confirmation page (unnecessary for this feature)

**Decision 2: Redirect path is `/` (homepage)**

The target is the root homepage rather than a separate logout page.

- **Why**: Users expect to return to the entry point; homepage is where they began
- **Alternatives**:
  - Redirect to `/sign-in` (confusing, reverses logout intent)
  - Redirect to `/dashboard` (requires re-authentication anyway)

## Risks / Trade-offs

- **No breaking changes**: Existing logout behavior is only visible to authenticated users, so this change has no downstream impact.
- **Simplicity**: This is a one-file change with minimal testing surface.

## Migration Plan

No migration needed. The change is deployed as a standard code update:
1. Update `app/auth/sign-out/route.ts` to redirect to homepage
2. Deploy
3. Test logout flow in dev/staging
4. Release to production
