## 1. Shared integration catalog

- [x] 1.1 Create `lib/integrationsCatalog.ts` exporting a typed catalog for `stripe`, `xero`, `myob`, `quickbooks`: name, status (`available` | `early_access` | `planned`), badge label, and short description text.
- [x] 1.2 Set `xero: available`, `myob: available`, `quickbooks: planned`, `stripe: available` per the already-decided state (matches `/integrations` and the archived `update-myob-business-and-xero-to-available` change).
- [x] 1.3 Add a small helper for status badge styling shared across pages (replacing the per-page `STATUS_BADGE_STYLES` maps).

## 2. Update marketing surfaces to read from the catalog

- [x] 2.1 Update `app/(marketing)/integrations/page.tsx` to read provider status/copy from `lib/integrationsCatalog.ts` instead of its local `integrations` array (no visible change expected — this is the reference-correct page).
- [x] 2.2 Update `app/(marketing)/page.tsx` homepage integrations grid to read from the catalog; Xero should now show Available.
- [x] 2.3 Update `app/(marketing)/roadmap/page.tsx` "Available / Private beta" list to include Xero alongside MYOB Business, sourced from the catalog where practical.
- [x] 2.4 Update `app/(marketing)/faq/page.tsx` accounting-software answer to state Xero and MYOB Business are both available and QuickBooks is planned.
- [x] 2.5 Update `app/(marketing)/docs/page.tsx` to move "Xero integration" from `futureDocs` into `currentDocs`, matching MYOB's existing "current" placement.

## 3. Tier-gated feature copy on /features and homepage FAQ

- [x] 3.1 Add a small helper (e.g. in `lib/planPresentation.ts`) that returns the lowest `SubscriptionTier` (by `PLAN_ORDER`) for which `hasPlanFeature(tier, feature)` is true.
- [x] 3.2 Update `app/(marketing)/features/page.tsx`'s "AI-Assisted Reminder Wording" card to name the correct tier (Solo) instead of "Business plans", using the helper from 3.1.
- [x] 3.3 Update `app/(marketing)/features/page.tsx`'s "Custom Branding" card to distinguish custom sender name (Solo+) from verified custom domain (Small Business+) instead of a single "Business and higher" claim.
- [x] 3.4 Update the homepage FAQ answer to "Does PaidSoon send emails in my name?" to reflect the same tiered reality instead of a blanket "on paid plans" claim.

## 4. Audit trail, free trial, and cancellation copy corrections

- [x] 4.1 Rewrite `/features`' "Security and Audit Trail" card to describe only the internal event logging that exists today (no customer-facing audit trail UI/export claim).
- [x] 4.2 Rewrite `/features`' meta description to remove "reports, accountant visibility... audit trail" phrasing that overstates current scope.
- [x] 4.3 Rewrite `/faq`'s "Is there a free trial?" answer to confirm the shipped 14-day, no-card-required trial.
- [x] 4.4 Rewrite `/faq`'s "Can I cancel at any time?" answer to confirm cancellation/downgrade is available today in account settings.

## 5. Validation

- [x] 5.1 Run `npm run lint` and `npx tsc --noEmit` (or project's typecheck script) on changed files.
- [x] 5.2 Manually review all five updated marketing pages for consistent Xero/MYOB/QuickBooks status and correct tier names.
- [x] 5.3 Confirm `/pricing` (untouched) still renders correctly and its `isFeatureImplemented`-driven behavior is unaffected.
