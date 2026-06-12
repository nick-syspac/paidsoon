## 1. Shared Spinner Component

- [x] 1.1 Create `components/ui/Spinner.tsx` with an inline SVG spinner using `animate-spin` and `currentColor`
- [x] 1.2 Accept optional `className` prop to allow size/colour overrides at call sites

## 2. Sign-In Form

- [x] 2.1 Import `Spinner` in `app/(auth)/sign-in/page.tsx`
- [x] 2.2 Replace the `{loading ? "Signing in..." : "Sign in"}` button content with `{loading ? <><Spinner /> Signing in…</> : "Sign in"}`

## 3. Sign-Up Form

- [x] 3.1 Import `Spinner` in `app/(auth)/sign-up/page.tsx`
- [x] 3.2 Replace the loading text in the sign-up submit button with the spinner + label pattern
