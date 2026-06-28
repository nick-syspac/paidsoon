## 1. Tenant List — Search and Users Collapse

- [x] 1.1 Add `?search=` query param support to `/api/admin/tenants/route.ts` — filter `UserProfile` by `displayName` containing the search string (case-insensitive)
- [x] 1.2 Update `/admin/(protected)/tenants/page.tsx`
- [x] 1.3 Delete `/admin/(protected)/users/page.tsx` and remove the Users nav link from the admin layout
- [x] 1.4 Add a redirect from `/admin/users` to `/admin/tenants` in `next.config.ts`

## 2. TenantSnapshot Data Fetch

- [x] 2.1 Create `lib/admin/tenantSnapshot.ts` — define the `TenantSnapshot` type and export `fetchTenantSnapshot(userId: string): Promise<TenantSnapshot | null>` that runs all required queries in parallel via `prismaAdmin` and calls `supabase.auth.admin.getUserById` for email and last sign-in
- [x] 2.2 Invoice counts: query `TrackedInvoice` grouped by `status` for the user; include `open`, `paused`, `snoozed`, `resolved`, `sequence_complete` counts
- [x] 2.3 Recent email log: query last 30 days of `EmailLog` for the user, excluding `clientEmail` from the select

## 3. Tenant Detail Page

- [x] 3.1 Create `app/admin/(protected)/tenants/[userId]/page.tsx`
- [x] 3.2 Create `components/admin/tenant-detail/IdentitySection.tsx`
- [x] 3.3 Create `components/admin/tenant-detail/SubscriptionSection.tsx`
- [x] 3.4 Create `components/admin/tenant-detail/ConnectionsSection.tsx`
- [x] 3.5 Create `components/admin/tenant-detail/ScheduleSection.tsx`
- [x] 3.6 Create `components/admin/tenant-detail/InvoiceSummarySection.tsx`
- [x] 3.7 Create `components/admin/tenant-detail/EmailLogSection.tsx`
- [x] 3.8 Create `components/admin/tenant-detail/EmailSettingsSection.tsx`
- [x] 3.9 Add a "← Tenants" back link to the detail page

## 4. Diagnostics Engine

- [x] 4.1 Create `lib/admin/diagnostics/types.ts` — define `Diagnostic`, `DiagnosticSeverity`, and `DiagnosticAction` types
- [x] 4.2 Create `lib/admin/diagnostics/checks/custom-from-unverified.ts` — implement check per spec
- [x] 4.3 Create `lib/admin/diagnostics/checks/trial-lapsed.ts` — implement check per spec
- [x] 4.4 Create `lib/admin/diagnostics/checks/stripe-connect-disconnected.ts` — implement check per spec
- [x] 4.5 Create `lib/admin/diagnostics/checks/sync-stale.ts` — implement check per spec (one diagnostic per stale connection)
- [x] 4.6 Create `lib/admin/diagnostics/checks/no-invoices-tracked.ts` — implement check with 7-day grace period per spec
- [x] 4.7 Create `lib/admin/diagnostics/index.ts` — export `runDiagnostics(snapshot: TenantSnapshot): Diagnostic[]` that runs all checks and returns sorted results (errors first, then warnings, then info)
- [x] 4.8 Write unit tests in `tests/admin-diagnostics.test.ts` covering healthy and unhealthy cases for each of the five checks

## 5. Diagnostics UI

- [x] 5.1 Create `components/admin/tenant-detail/DiagnosticsSection.tsx`
- [x] 5.2 Issue card shows: severity badge, title, description, runbook link, and action buttons
- [x] 5.3 Integrate `runDiagnostics` into the tenant detail page

## 6. Corrective Action Endpoints

- [x] 6.1 Create `app/api/admin/tenants/[id]/actions/reset-email-from/route.ts` — POST: require full admin elevation; set `fromEmail`, `fromName`, `replyTo` to null; log audit event with old `fromEmail` in metadata; return `{ success: true }`
- [x] 6.2 Create `app/api/admin/tenants/[id]/actions/extend-trial/route.ts` — POST: require full admin elevation; validate `days` (1–30) with Zod; reject if `subscriptionStatus !== "trialing"`; update `trialEndsAt`; log audit event; return `{ success: true, newTrialEndsAt }`
- [x] 6.3 Create `app/api/admin/tenants/[id]/actions/trigger-resync/route.ts` — POST: require full admin elevation; validate `connectionId` exists and belongs to target tenant; invoke the provider's sync function; log audit event; return `{ success: true }`
- [x] 6.4 Add `admin_tenant_action` to the `AdminAuditAction` enum in `prisma/schema.prisma` and generate a migration

## 7. Corrective Action UI

- [x] 7.1 Create `components/admin/tenant-detail/ActionButton.tsx`
- [x] 7.2 Wire "Reset to system From" button into the `custom-from-unverified` diagnostic card
- [x] 7.3 Wire "Extend trial 7 days" button into the `trial-lapsed` diagnostic card
- [x] 7.4 Wire "Trigger resync" button into each `sync-stale` diagnostic card

## 8. Runbooks

- [x] 8.1 Create `lib/admin/runbooks/index.ts` — define `Runbook` type and export `RUNBOOKS` registry (array of `{ slug, title, severity, body }` objects) covering all five MVP slugs
- [x] 8.2 Write runbook prose for `custom-from-unverified`
- [x] 8.3 Write runbook prose for `trial-lapsed`
- [x] 8.4 Write runbook prose for `stripe-connect-disconnected`
- [x] 8.5 Write runbook prose for `sync-stale`
- [x] 8.6 Write runbook prose for `no-invoices-tracked`
- [x] 8.7 Create `app/admin/(protected)/runbooks/page.tsx`
- [x] 8.8 Create `app/admin/(protected)/runbooks/[slug]/page.tsx`
- [x] 8.9 Add Runbooks link to the admin navigation layout

## 9. Navigation and Cleanup

- [x] 9.1 Update admin nav in `app/admin/layout.tsx`
- [x] 9.2 Add breadcrumb back-link to tenant detail page

## 10. Verification

- [x] 10.1 Confirm `npm run build` passes with no type errors
- [x] 10.2 Confirm `npm test` passes with new `tests/admin-diagnostics.test.ts` tests
- [x] 10.3 Manually verify the full flow
- [x] 10.4 Update `docs/DDD.md` with new routes and `admin_tenant_action` enum value
