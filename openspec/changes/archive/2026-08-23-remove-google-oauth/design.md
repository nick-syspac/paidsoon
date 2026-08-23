# Design: Remove Google OAuth from Auth Screens

## Affected Files

| File | What changes |
|------|-------------|
| `app/(auth)/sign-in/page.tsx` | Remove `handleGoogleSignIn`, Google button JSX, "or" divider, and unused `createClient` import |
| `app/(auth)/sign-up/page.tsx` | Remove `handleGoogleSignUp`, Google button JSX, "or" divider, and unused `createClient` import |

## Sign-in page (`app/(auth)/sign-in/page.tsx`)

### Handler to remove
```ts
async function handleGoogleSignIn() {
  persistClientTraceCookie(traceState.traceId)
  traceClientEvent(traceState, { ... })
  const supabase = createClient()
  await supabase.auth.signInWithOAuth({ provider: "google", ... })
}
```

### JSX to remove (from the return block)
```tsx
<button
  onClick={handleGoogleSignIn}
  className="w-full border border-gray-300 rounded-md py-2 px-4 text-sm font-medium hover:bg-gray-50 transition mb-4 flex items-center justify-center gap-2"
>
  Continue with Google
</button>

<div className="flex items-center gap-3 mb-4">
  <div className="flex-1 h-px bg-gray-200" />
  <span className="text-xs text-gray-400">or</span>
  <div className="flex-1 h-px bg-gray-200" />
</div>
```

### Import to remove (if no other usage remains)
```ts
import { createClient } from "@/lib/supabase/client"
```

## Sign-up page (`app/(auth)/sign-up/page.tsx`)

### Handler to remove
```ts
async function handleGoogleSignUp() {
  const supabase = createClient()
  await supabase.auth.signInWithOAuth({ provider: "google", ... })
}
```

### JSX to remove (from the return block, inside the non-checkEmail branch)
```tsx
<button
  onClick={handleGoogleSignUp}
  className="w-full border border-gray-300 rounded-md py-2 px-4 text-sm font-medium hover:bg-gray-50 transition mb-4 flex items-center justify-center gap-2"
>
  Continue with Google
</button>

<div className="flex items-center gap-3 mb-4">
  <div className="flex-1 h-px bg-gray-200" />
  <span className="text-xs text-gray-400">or</span>
  <div className="flex-1 h-px bg-gray-200" />
</div>
```

### Import to remove (if no other usage remains)
```ts
import { createClient } from "@/lib/supabase/client"
```

## Notes

- `persistClientTraceCookie` and `traceClientEvent` are still used by the email sign-in handler, so those imports stay in `sign-in/page.tsx`.
- The `/auth/callback` route is left untouched — it is referenced by the email confirmation flow as well.
- No Supabase dashboard or environment-variable changes are needed.
