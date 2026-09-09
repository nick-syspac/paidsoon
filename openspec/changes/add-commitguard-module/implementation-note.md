## CommitGuard implementation mapping note

This note captures repository reuse points confirmed before production edits.

## Reuse points audited

### Dashboard navigation and module placement
- Dashboard shell and width routing: components/dashboard/DashboardMain.tsx
- Dashboard tab rail: components/dashboard/DashboardNavRail.tsx
- Dashboard access wiring (tier-based module toggles): app/dashboard/layout.tsx
- Existing module routes confirm current naming pattern:
  - /dashboard/cost-guard
  - /dashboard/tax-buffer
  - /dashboard/spendleak

CommitGuard placement decision:
- Add /dashboard/commitguard as a peer route in existing rail and wide-route list.
- Keep current navigation structure; add one new tab only.

### Settings architecture
- Settings group/item source of truth: lib/settings/navigation.ts
- Existing module settings pages:
  - app/dashboard/settings/cost-guard/page.tsx
  - app/dashboard/settings/tax-buffer/page.tsx
  - app/dashboard/settings/cash-plan/page.tsx
- Import/export settings surface is server-rendered module composition:
  - app/dashboard/settings/import-export/page.tsx
  - components/settings/ImportExportSettingsView.tsx

CommitGuard settings placement decision:
- Add /dashboard/settings/commitguard entry under a new or existing module group in lib/settings/navigation.ts.
- Follow Tax Buffer + Cost Guard page pattern (server gate + typed client form component).

### Entitlements and plan catalog
- Canonical feature model: lib/subscriptionPlans.ts
- Feature enforcement helper: lib/billing.ts (requireFeature, hasPlanFeature)
- Access helper module pattern: lib/dashboard/taxBufferAccess.ts and lib/dashboard/spendleakAccess.ts

CommitGuard entitlement decision:
- Add commitguard_* feature keys and limits to SubscriptionFeature/PLAN_CATALOG.
- Enforce through requireFeature/hasPlanFeature and new lib/dashboard/commitguardAccess.ts helper.

### Notification and dedupe patterns
- Tax Buffer event persistence and dedupe key style: lib/taxBuffer/service.ts
- Cost Guard event type/status utilities and dedupe key construction: lib/costGuard/foundation.ts
- Dashboard notification aggregation entry point: app/dashboard/page.tsx

CommitGuard notification decision:
- Add CommitGuard event records with stable dedupe keys per user+event window.
- Reuse dashboard aggregation flow rather than introducing a new transport path.

### Audit trail patterns
- Admin audit helper exists but is admin-scoped: lib/admin/audit.ts
- Domain-specific event history in financial modules is persisted as module event rows (example: CostGuardAlertEvent, TaxBufferEvent in prisma/schema.prisma + service usage).

CommitGuard audit decision:
- Implement module-scoped lifecycle event table(s) for commitment actions and material changes.
- Do not couple user financial audit to admin audit table.

### Financial calculation and API conventions
- Deterministic calculation engine pattern: lib/taxBuffer/engine.ts and lib/cashplan/engine.ts
- Service orchestration pattern (RLS + persistence + event writing): lib/taxBuffer/service.ts
- API route boundary pattern (auth, zod, feature gate, safe errors): app/api/tax-buffer/settings/route.ts and app/api/cashplan/summary/route.ts

CommitGuard calculation/API decision:
- Implement pure calculation utilities in lib/commitguard/engine.ts and orchestration in lib/commitguard/service.ts.
- Add app/api/commitguard/** routes using existing auth/zod/withUserContext conventions.

### Database and tenancy conventions
- User-owned tables relate to UserProfile.userId and use @@index patterns with userId + operational dimension.
- RLS enforcement expectation is withUserContext(userId, ...); route auth identity from supabase.auth.getUser().

CommitGuard schema decision:
- Add tenant-scoped commitment tables keyed by userId with indexes for:
  - [userId, nextDueDate]
  - [userId, status]
  - [userId, renewalDate]
  - [userId, source]

## Capability-to-code mapping

### New capabilities
- commitguard-foundation:
  - prisma/schema.prisma
  - prisma/rls-policies.sql
  - lib/commitguard/types.ts
  - lib/commitguard/service.ts
- commitguard-forecast-and-free-cash:
  - lib/commitguard/engine.ts
  - lib/commitguard/freeCash.ts
  - lib/commitguard/service.ts
- commitguard-dashboard:
  - app/dashboard/commitguard/page.tsx
  - components/dashboard/commitguard/*
  - app/api/commitguard/summary/route.ts
  - app/api/commitguard/upcoming/route.ts
  - app/api/commitguard/timeline/route.ts
- commitguard-commitment-lifecycle:
  - app/api/commitguard/commitments/route.ts
  - app/api/commitguard/commitments/[id]/route.ts
  - app/api/commitguard/commitments/[id]/pause/route.ts
  - app/api/commitguard/commitments/[id]/cancel/route.ts
  - app/api/commitguard/commitments/[id]/confirm/route.ts
- commitguard-renewal-guard:
  - lib/commitguard/renewals.ts
  - app/api/commitguard/renewals/route.ts
- commitguard-detection-review:
  - lib/commitguard/detection.ts
  - app/api/commitguard/detected/route.ts
  - app/api/commitguard/detected/[id]/confirm/route.ts
  - app/api/commitguard/detected/[id]/ignore/route.ts
- commitguard-settings:
  - app/dashboard/settings/commitguard/page.tsx
  - components/settings/CommitGuardSettingsClient.tsx
  - app/api/settings/commitguard/route.ts
- commitguard-notifications:
  - lib/commitguard/service.ts (event emit + dedupe)
  - app/dashboard/page.tsx (summary feed integration)

### Modified capabilities
- dashboard-overview:
  - app/dashboard/page.tsx
  - lib/dashboard/financialOperationsSummary.ts
- implementation-gated-entitlements + subscription-plan-tiers:
  - lib/subscriptionPlans.ts
  - lib/billing.ts
  - lib/dashboard/commitguardAccess.ts
- cost-guard-alerts linkage:
  - lib/costGuard/foundation.ts
  - cost guard API summary/detail mappers
- spendleak-insights linkage:
  - spend insight API serializers and presentation mappers
- settings-import-export:
  - app/dashboard/settings/import-export/page.tsx
  - components/settings/ImportExportSettingsView.tsx

## File layout confirmation
- app/: dashboard routes + API routes
- components/: presentation and client forms
- lib/: domain engines/services/access helpers
- prisma/: schema + RLS canonical policy
- tests/: node test runner-based unit/integration coverage
- docs/: DDD/HLD/runbook updates
