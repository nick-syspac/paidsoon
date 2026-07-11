# MYOB Business runbook

MYOB Business is a pull-based accounting integration: PaidSoon connects to a user's MYOB
company file via OAuth 2.0, then imports overdue invoices on a daily cron schedule (and on
demand) so reminders can be sent without the user re-entering invoice data.

> Env-var values come from [README.md](./README.md) — set them in the environment named in each row.

**Prerequisites:** a [MYOB developer](https://developer.myob.com) account and a registered app.

---

## 1. Register a MYOB developer app

1. [developer.myob.com](https://developer.myob.com) → sign up / sign in.
2. Create a new app (one app is enough for all environments — MYOB does not require a
   separate app per environment, only a separate redirect URI per environment).
3. Record the **API Key** (`MYOB_CLIENT_ID`) and **Secret** (`MYOB_CLIENT_SECRET`).
4. Add a redirect URI for each environment you plan to run:
   - Local: `http://localhost:4001/api/integrations/myob/callback` (this repo's `next dev` script is pinned to port 4001 — see `package.json`)
   - Preview: `<preview deployment URL>/api/integrations/myob/callback`
   - Production: `https://paidsoon.com/api/integrations/myob/callback`

The redirect URI registered in the MYOB developer portal **must exactly match**
`MYOB_REDIRECT_URI` for that environment, including scheme and trailing slash. A mismatch
fails the OAuth exchange with an `invalid redirect_uri` error at MYOB, before PaidSoon ever
sees a callback.

---

## 2. Environment variables

| Env var | Local | Preview | Production |
|---|---|---|---|
| `MYOB_CLIENT_ID` | dev app API key | same as Local | same MYOB app (or a dedicated production app) |
| `MYOB_CLIENT_SECRET` | dev app secret | same as Local | same MYOB app secret — server-side only |
| `MYOB_REDIRECT_URI` | `http://localhost:4001/api/integrations/myob/callback` | preview deployment URL + `/api/integrations/myob/callback` | `https://paidsoon.com/api/integrations/myob/callback` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` | same generation method (can differ per environment) | `openssl rand -hex 32` — shared with the Xero integration; never rotate without a re-encryption pass over `accounting_connections` |

`MYOB_CLIENT_ID` and `MYOB_CLIENT_SECRET` are read by
[lib/providers/accounting/myob.ts](../../lib/providers/accounting/myob.ts) and the
[connect](../../app/api/integrations/myob/connect/route.ts) /
[callback](../../app/api/integrations/myob/callback/route.ts) routes.
`TOKEN_ENCRYPTION_KEY` is read by
[lib/providers/accounting/crypto.ts](../../lib/providers/accounting/crypto.ts) to encrypt
OAuth tokens at rest — it is shared with the Xero integration, so do not set a MYOB-specific
value for it.

---

## 3. Validating the connection per environment

MYOB scopes requested are `sme-sales` (invoices), `sme-contacts-customer` (contacts), and
`sme-company-file` (company-file list endpoint, used by `getOrganisations` during connect) —
all read-only, granular scopes introduced by MYOB's March 2025 scope changes. Do not request
the legacy broad `CompanyFile` scope (deprecated 1 September 2026) — `sme-company-file` is a
distinct granular scope and is required, not optional: without it, the company-file list call
(`GET https://api.myob.com/accountright/`) fails with a persistent 401 `OAuthTokenIsInvalid`
even for a validly Admin-authorised token.

### 3.1 Local / Preview

1. Set the four env vars above for the environment.
2. Sign in, go to **Settings → Integrations**, click **Connect MYOB**.
3. Authorise against a MYOB sandbox or trial company file. MYOB's hosted screen only
   covers login/consent — it does **not** let you pick a company file. Company-file
   selection happens back on PaidSoon, after the token exchange:
   - If the token can only reach one company file, the connection is created immediately.
   - If it can reach more than one, you're redirected to
     `/dashboard/settings/connections/myob/select-org` to pick one before the connection
     is created.
4. Confirm the redirect lands back on the integrations page with
   `?code=connected` and the connection card shows a status other than
   **Sync error** — a first sync now runs automatically as part of connecting.
5. If the card shows **Importing…** for more than a minute, use **Sync now** to retry, or
   check server logs for `[myob/callback] initial sync failed to run`.

### 3.2 Production

Repeat the same steps against a real MYOB Business company file before marking MYOB as
launch-ready. Do not rely on sandbox-only validation for the go-live decision — see the
gate `G-MYOB2` in [go-live-decision-matrix.md](./go-live-decision-matrix.md).

### 3.3 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| MYOB redirects with `error=myob_cancelled` | User declined authorisation | Expected — no action needed |
| MYOB redirects with `error=no_organisations` | The authorising MYOB account has no accessible company file | Confirm the MYOB app has at least one accessible company file for the authorising user |
| MYOB redirects with `error=org_fetch_failed` | The company-file list call (`GET https://api.myob.com/accountright/`) failed after token exchange, even after the built-in 401 retry (up to 4 retries over ~20s to cover MYOB token-propagation delay) | Check server logs for `[myob/callback] getOrganisations failed`. If the 401 is **transient** (succeeds partway through the retries), it was propagation delay — no action needed. If it fails **every single retry** across the full ~20s window, it's not propagation delay — check (1) the OAuth scope includes `sme-company-file` (see §3 above), and (2) the MYOB user who authorised the connection has **Admin** access to the company file (MYOB requires Admin-level approval for OAuth since March 2025 — Settings → Users and Permissions → confirm Access = Admin) |
| User isn't shown a company-file picker despite having multiple files | Selection only appears when `getOrganisations` returns more than one entry — confirm the MYOB account genuinely has multiple company files reachable by the granted scopes | Check server logs for `[myob/callback]`; verify the `myob_pending_<key>` cookie is being set (see [select-org route](../../app/api/integrations/myob/select-org/route.ts)) |
| `error=selection_expired` or `error=invalid_selection` on the select-org form | The 30-minute pending cookie expired, was already used, or didn't match the signed-in user | Ask the user to click **Connect MYOB** again from the start |
| Connection stays in **Importing…** | The inline first sync failed or the process restarted mid-request | Click **Sync now**; if it keeps failing, check `AccountingSyncRun.errorMessage` for that connection via the admin tenant detail page |
| Connection shows **Sync error** | The first sync ran and failed | Click **Retry sync**; investigate the `errorMessage` on the most recent `AccountingSyncRun` row |
| 401 errors against real company files | Missing `x-myobapi-key` / `x-myobapi-version` header, or an expired token | Confirm `MYOB_CLIENT_ID` matches the app the token was issued for; tokens expire after 20 minutes and are refreshed automatically before each sync |

---

## 4. Where MYOB is consumed in code

| Concern | File |
|---|---|
| OAuth + invoice/contact provider | [lib/providers/accounting/myob.ts](../../lib/providers/accounting/myob.ts) |
| Connect route | [app/api/integrations/myob/connect/route.ts](../../app/api/integrations/myob/connect/route.ts) |
| Callback route (single company file) | [app/api/integrations/myob/callback/route.ts](../../app/api/integrations/myob/callback/route.ts) |
| Company-file selection route (multiple company files) | [app/api/integrations/myob/select-org/route.ts](../../app/api/integrations/myob/select-org/route.ts) |
| Company-file selection UI | [app/dashboard/settings/connections/myob/select-org/page.tsx](<../../app/dashboard/settings/connections/myob/select-org/page.tsx>) |
| Manual sync route | [app/api/integrations/myob/sync/route.ts](../../app/api/integrations/myob/sync/route.ts) |
| Disconnect route | [app/api/integrations/myob/disconnect/route.ts](../../app/api/integrations/myob/disconnect/route.ts) |
| Sync orchestrator (shared with Xero) | [lib/providers/accounting/sync.ts](../../lib/providers/accounting/sync.ts) |
| User-facing settings UI | [components/settings/AccountingConnectionsClient.tsx](../../components/settings/AccountingConnectionsClient.tsx) |
| Admin connection visibility | [components/admin/tenant-detail/ConnectionsSection.tsx](../../components/admin/tenant-detail/ConnectionsSection.tsx), [app/admin/(protected)/integrations/page.tsx](<../../app/admin/(protected)/integrations/page.tsx>) |
| Admin stale/error detection + resync action | [lib/admin/diagnostics/checks/sync-stale.ts](../../lib/admin/diagnostics/checks/sync-stale.ts), [app/api/admin/tenants/[id]/actions/trigger-resync/route.ts](<../../app/api/admin/tenants/[id]/actions/trigger-resync/route.ts>) |

---

## 5. Launch readiness

MYOB-specific go-live gates, pass/fail criteria, and rollout-level rules are documented in
[go-live-decision-matrix.md](./go-live-decision-matrix.md). Do not describe MYOB as a
supported production data source in user-facing copy until those gates pass.

For the OpenSpec task 15.7 pre-archive validation gate, run
[myob-sandbox-verification.md](./myob-sandbox-verification.md) and attach the evidence package
before archiving the change.

---

## 6. Resetting a user's MYOB connection (support/admin)

The user's own **Disconnect** button (Settings → Connections) is the self-service path and
should always be tried first — it calls
[app/api/integrations/myob/disconnect/route.ts](../../app/api/integrations/myob/disconnect/route.ts),
which sets the connection's `status` to `disconnected` and clears `nextEmailAt` on any
`TrackedInvoice`s linked to it. The admin tenant detail page currently only exposes a
**resync** action ([trigger-resync](<../../app/api/admin/tenants/[id]/actions/trigger-resync/route.ts>)),
not a disconnect/reset — there is no admin UI button for this yet.

When an operator needs to reset a connection on a user's behalf (e.g. the user can't access
their account, or a stale connection is blocking a clean reconnect), use
[scripts/reset-myob-connection.ts](../../scripts/reset-myob-connection.ts). It runs via
`prismaAdmin` (bypassing RLS) because it executes out-of-band with no user session.

### 6.1 Usage

```bash
# Soft reset (default) — same effect as the user's own Disconnect button.
# Reconnecting afterwards goes through the normal OAuth flow.
USER_EMAIL=user@example.com npm run reset:myob-connection

# Or target by Supabase user ID directly:
USER_ID=clxxxxxxxx npm run reset:myob-connection

# Hard delete — removes the AccountingConnection row and its sync history/
# mappings entirely. Use only when the soft reset doesn't unblock reconnecting
# (e.g. the unique [userId, provider, organisationId] constraint is stuck on a
# corrupted row).
HARD_DELETE=true USER_EMAIL=user@example.com npm run reset:myob-connection
```

An interactive wrapper, [scripts/reset-myob-connection.sh](../../scripts/reset-myob-connection.sh),
is also available and prompts for confirmation before a hard delete:

```bash
scripts/reset-myob-connection.sh --email user@example.com
scripts/reset-myob-connection.sh --user-id clxxxxxxxx --hard-delete
```

Requires `DATABASE_URL` (Prisma). `USER_EMAIL` additionally requires
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` to resolve the email to a Supabase user
ID — see [README.md](./README.md) for where those values come from per environment.

### 6.2 What it does

| Mode | AccountingConnection | AccountingSyncRun / mappings | TrackedInvoice.nextEmailAt |
|---|---|---|---|
| Soft (default) | `status` → `disconnected` | left in place | cleared for linked invoices |
| `HARD_DELETE=true` | row deleted | deleted (sync runs, invoice mappings, contact mappings) | cleared for linked invoices |

The script only ever targets connections where `provider = "myob"` for the given user — it
does not touch Xero connections.

### 6.3 After resetting

Tell the user to reconnect via **Settings → Connections → Connect MYOB**. A fresh
`AccountingConnection` row is created on the OAuth callback and a first sync runs
automatically — see section 3 above for what a healthy reconnect looks like.
