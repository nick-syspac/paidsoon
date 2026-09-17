# Owner's Digest Operations Runbook

This runbook covers Owner's Digest generation, history, settings, and email delivery operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- Current-period digest generation and regeneration are live.
- Digest history and detail views are live.
- Digest settings and scheduled email delivery are live.
- Owner's Digest aggregates currently entitled module signals; it does not fabricate unsupported recommendations.

## 1. Operational flows

### 1.1 Digest generation and current-period access

Primary paths:

- `lib/ownersDigest/service.ts`
- `lib/ownersDigest/logic.ts`
- `lib/ownersDigest/providers.ts`
- `GET /api/owners-digest/current`
- `POST /api/owners-digest/regenerate`

Operational notes:

- The current-period route lazily generates the current digest when needed.
- Snapshots are immutable per period and reused where possible.
- Only currently entitled module signals should contribute to the digest.

### 1.2 History, detail, and settings

Primary user-facing surfaces:

- `/dashboard/owners-digest`
- `/dashboard/owners-digest/[digestId]`
- `/dashboard/settings/owners-digest`

Primary routes:

- `GET /api/owners-digest/history`
- `GET /api/owners-digest/[digestId]`
- `GET/PUT /api/owners-digest/settings`

### 1.3 Scheduled email delivery

Internal delivery endpoint:

- `POST /api/internal/jobs/send-owners-digest`
- Auth: `Authorization: Bearer INTERNAL_JOBS_SECRET`
- Body: `{ "userId": "<id>" }`

Primary paths:

- `lib/email/sendOwnersDigest.ts`
- `lib/email/ownersDigest.ts`
- `lib/ownersDigest/recipient.ts`

Operational notes:

- Delivery respects digest settings, cadence, day, time, and recipient scope.
- Sent deliveries are deduplicated by `deliveryKey` per user and period.
- Empty digests can be skipped when settings disable empty sends.

## 2. Environment variables

Owner's Digest reuses the central matrix in `docs/runbooks/README.md` and introduces no module-specific values.

Required for scheduled email delivery:

- `INTERNAL_JOBS_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `SUPABASE_SECRET_KEY`

Supporting setup remains centralized in `resend.md`, `supabase.md`, `railway.md`, and `vercel.md`.

## 3. Operational boundaries

- Owner's Digest aggregates deterministic module outputs; it is not a free-form AI summarizer.
- Email delivery is optional and settings-controlled.
- Missing recipient email or empty-digest settings can legitimately cause a skipped send.

## 4. Troubleshooting

### 4.1 Digest page loads but no current digest appears

Likely causes:

- The tenant lacks the relevant digest feature.
- Current-period generation produced an empty or incomplete result because upstream module data is unavailable.

Actions:

1. Confirm entitlement for `owners_digest_core` and related history/email features.
2. Check source completeness in the dashboard and current digest response.
3. Verify upstream modules are returning current data before forcing regenerate calls.

### 4.2 Scheduled digest email is skipped

Likely causes:

- The digest is not due for the current day/time.
- Email delivery is disabled in settings.
- No recipient email could be resolved.
- The digest is empty and `sendWhenEmpty` is disabled.

Actions:

1. Check settings for `enabled`, `emailEnabled`, cadence, day, and time.
2. Verify the owner email can be resolved through the Supabase admin path.
3. Check the returned skip reason before retrying the internal job.

### 4.3 Internal job returns 401 or send fails

Likely causes:

- `INTERNAL_JOBS_SECRET` mismatch.
- Missing or invalid Resend configuration.
- Delivery was already sent for the same digest period.

Actions:

1. Verify `INTERNAL_JOBS_SECRET` between caller and app.
2. Verify `RESEND_*` and `SUPABASE_SECRET_KEY` configuration.
3. Check the `OwnersDigestDelivery` row for the tenant and delivery key before re-sending.