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
   - Local: `http://localhost:3000/api/integrations/myob/callback`
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
| `MYOB_REDIRECT_URI` | `http://localhost:3000/api/integrations/myob/callback` | preview deployment URL + `/api/integrations/myob/callback` | `https://paidsoon.com/api/integrations/myob/callback` |
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

MYOB scopes requested are `sme-sales` (invoices) and `sme-contacts-customer` (contacts) —
read-only, granular scopes. Do not request `sme-company-file` or the legacy `CompanyFile`
scope.

### 3.1 Local / Preview

1. Set the four env vars above for the environment.
2. Sign in, go to **Settings → Integrations**, click **Connect MYOB**.
3. Authorise against a MYOB sandbox or trial company file.
4. Confirm the redirect lands back on the integrations page with
   `?success=myob_connected` and the connection card shows a status other than
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
| MYOB redirects with `error=missing_company_file` | MYOB did not return a `businessId` on callback | Confirm the MYOB app has at least one accessible company file for the authorising user |
| Connection stays in **Importing…** | The inline first sync failed or the process restarted mid-request | Click **Sync now**; if it keeps failing, check `AccountingSyncRun.errorMessage` for that connection via the admin tenant detail page |
| Connection shows **Sync error** | The first sync ran and failed | Click **Retry sync**; investigate the `errorMessage` on the most recent `AccountingSyncRun` row |
| 401 errors against real company files | Missing `x-myobapi-key` / `x-myobapi-version` header, or an expired token | Confirm `MYOB_CLIENT_ID` matches the app the token was issued for; tokens expire after 20 minutes and are refreshed automatically before each sync |

---

## 4. Where MYOB is consumed in code

| Concern | File |
|---|---|
| OAuth + invoice/contact provider | [lib/providers/accounting/myob.ts](../../lib/providers/accounting/myob.ts) |
| Connect route | [app/api/integrations/myob/connect/route.ts](../../app/api/integrations/myob/connect/route.ts) |
| Callback route | [app/api/integrations/myob/callback/route.ts](../../app/api/integrations/myob/callback/route.ts) |
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
