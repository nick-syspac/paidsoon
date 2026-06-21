---
applyTo: "**/app/api/**,**/lib/**"
---

# Backend API Instructions — PaidSoon

## API Route Conventions

- All API routes live under `app/api/`. Each route is a `route.ts` file.
- Export named HTTP method handlers: `export async function GET(...)`, `export async function POST(...)`.
- Every route handler must:
  1. Authenticate the user via `createClient()` from `lib/supabase/server.ts` + `supabase.auth.getUser()`.
  2. Return `401` if no valid session exists.
  3. Validate input with a Zod schema before processing.
  4. Use `withUserContext(userId, ...)` for all DB operations in user-facing routes.

## Auth Checks

```ts
// Standard pattern for every user-facing route handler
const supabase = await createClient()
const { data: { user }, error } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

- Never trust `userId` from the request body or query string. Always derive from `supabase.auth.getUser()`.
- The `userId` is `user.id` — a UUID string matching `auth.users.id` in Supabase and `UserProfile.userId` in Prisma.

## Input Validation

- All external input (request bodies, query params, route params) must be validated with Zod at the boundary.
- Return `400` with a clear `error` message on validation failure.
- Example pattern:

```ts
const schema = z.object({ stage: z.number().int().min(1).max(3) })
const parsed = schema.safeParse(await req.json())
if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
```

## Error Response Conventions

| Situation             | HTTP Status | Response body                         |
|-----------------------|-------------|---------------------------------------|
| No session            | 401         | `{ error: "Unauthorized" }`           |
| Invalid input         | 400         | `{ error: <Zod flatten or string> }`  |
| Missing resource      | 404         | `{ error: "Not found" }`              |
| Feature not in tier   | 403         | `{ error: "Upgrade required" }`       |
| Unexpected error      | 500         | `{ error: "Internal server error" }`  |

- Never leak stack traces, DB error messages, or internal IDs in 5xx responses.
- Log unexpected errors with `console.error` server-side.

## Database Access in Routes

- User-facing routes: always use `withUserContext(userId, async (tx) => { ... })`.
- Webhook/cron routes: use `prismaAdmin` (imported from `lib/db/admin.ts`). Add a comment explaining why.
- `amountDue` is stored as an integer in cents. Do not convert to/from floating-point dollars in DB queries.

## Supabase Server Client

- Import from `lib/supabase/server.ts`. Never import from `lib/supabase/client.ts` in route handlers.
- `createClient()` is async — it reads cookies via `await cookies()`.

## Rate Limiting

- Rate limiting for auth and high-frequency routes is expected at the Vercel edge level (middleware or Vercel WAF).
- Do not add in-process rate limiting unless a specific runbook instructs it.
- Cron route (`/api/cron/send-emails`) is protected by `CRON_SECRET` bearer token — this is the only rate protection needed.

## Webhook Routes

- Both Stripe webhook handlers (`/api/webhooks/stripe-billing` and `/api/webhooks/stripe-connect`) MUST verify signature before processing any events.
- Use `stripe.webhooks.constructEvent(payload, signature, secret)` for verification.
- Return `400` if signature is invalid. Never process unverified events.
- Use `prismaAdmin` in webhook handlers (RLS bypass is intentional and documented).

## Logging Rules

- Log errors with `console.error` on the server.
- Do not log `clientEmail`, `clientName`, or other PII to stdout/stderr.
- Do not log Stripe API keys, Resend keys, or any secrets.

## Idempotency

- Invoice ingestion uses `(externalId, provider, userId)` as an idempotency key — do not insert duplicates.
- Email sending checks `EmailLog(trackedInvoiceId, stage)` before dispatching — do not resend if record exists.
- Stripe checkout uses `stripe.checkout.sessions.create` with `customer` to avoid duplicate customer creation.
