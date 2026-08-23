# Proposal: Remove Google OAuth from Auth Screens

## What

Remove the **"Continue with Google"** button and its associated handler code from both the sign-in page (`app/(auth)/sign-in/page.tsx`) and the sign-up page (`app/(auth)/sign-up/page.tsx`). Also remove the visual "or" divider that sits between the Google button and the email/password form, since it only has meaning when two login methods exist.

After this change both screens will present only the email-address and password form.

## Why

At this stage of the product, Google OAuth is not ready for production users. Offering it as an option creates an unsupported sign-in path that can result in orphaned accounts or inconsistent session states. Removing the button is the safest and cleanest way to enforce email/password-only authentication until OAuth is properly configured and tested.

## Scope

- `app/(auth)/sign-in/page.tsx` — remove `handleGoogleSignIn` function, the Google button, and the "or" divider.
- `app/(auth)/sign-up/page.tsx` — remove `handleGoogleSignUp` function, the Google button, and the "or" divider.
- Remove the `createClient` import from each file if it is no longer used after the handler is removed.
- No backend, API route, or Supabase config changes are required — the OAuth provider can remain configured in Supabase; this change only hides the UI entry point.

## Out of Scope

- Disabling the OAuth provider in the Supabase dashboard.
- Changes to the `/auth/callback` route (it may still be needed for future OAuth flows).
- Any styling or copy changes beyond removing the button and divider.
