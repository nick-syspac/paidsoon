## Why

PaidSoon's subscription tiers exist in two contradictory states. The June 2026 change
`update-subscription-plan-tiers` established Starter $9 / Solo $19 / Small Business $39 and
that remains the deployed spec (`openspec/specs/subscription-plan-tiers/spec.md`). Five days
later, `implement-paidsoon-marketing-navigation` renamed the tiers to Starter $19 / Business
$49 / Accountant Partner — but that rename only ever reached `lib/subscriptionPlans.ts` and
the marketing pricing page. It never reached Stripe, the preview/production env templates,
the user-facing gate copy, or the spec.

The result is a live price mismatch: the pricing page advertises Starter at $19 while
`app/api/billing/checkout/route.ts` sends `STRIPE_STARTER_PRICE_ID` — a $9 price — to
Stripe Checkout. Because the product is not yet live, this can be corrected by completing
the revert rather than by migrating subscribers.

## What Changes

- **BREAKING** Tier identifiers change from `starter` / `business` / `accountant_partner` to
  `starter` / `solo` / `small_business` / `accountant_partner`. `solo` and `small_business`
  cease to be legacy aliases and become first-class tiers.
- **BREAKING** `LEGACY_TIER_MAP` is deleted rather than extended. No alias resolution
  survives; unknown values fall back to the default tier. Safe because no production
  subscribers exist.
- Prices become Starter A$9 / Solo A$19 / Small Business A$39 per month, **inclusive of GST**,
  matching the Price objects that already exist in Stripe.
- Plan limits become: chased invoices 10 / 50 / 200; internal users 1 / 1 / 3; connected
  invoice-source accounts 1 / 1 / 1 for all three visible tiers.
- `accountant_partner` is retained in the catalog as a **hidden**, contact-us tier: reachable
  by identifier and by the contact route, but absent from the pricing page, the onboarding
  plan picker, and upgrade recommendations.
- Solo is marked "Most Popular" via a `popular` field on `PlanDefinition`, not via
  page-local markup.
- Displayed plan names, prices, and limits are derived from `PLAN_CATALOG` instead of being
  hardcoded. Today the same figures are duplicated across the marketing pricing page, its
  SEO metadata, the onboarding plan picker, and several settings gate messages — the direct
  cause of the drift this change repairs.
- Feature gates are re-cut to the new boundaries: promise-to-pay tracking, dispute pause and
  the debtor dashboard become available on every paid tier; the single `own_email_address`
  boolean is split into a sender-identity ladder (reply-to only → custom sender name and
  reply-to → verified custom from-domain).
- Unimplemented capabilities named in plan marketing (weekly debtor summary, approval mode,
  customer suppression/do-not-contact, CSV export, multi-user seats, customer-specific
  sequences) are labelled as forthcoming rather than presented as available.
- Stripe env vars are consolidated: `STRIPE_STARTER_PRICE_ID`, `STRIPE_SOLO_PRICE_ID` and
  `STRIPE_SMALL_BUSINESS_PRICE_ID` become the canonical three; `STRIPE_BUSINESS_PRICE_ID`
  and `STRIPE_PRO_PRICE_ID` are removed.

## Capabilities

### New Capabilities

None. This change re-establishes existing behaviour at corrected values.

### Modified Capabilities

- `subscription-plan-tiers`: tier identifiers, prices, limits, GST treatment, tier
  visibility, the requirement that displayed pricing derive from the canonical catalog, and
  re-cut feature boundaries.

## Impact

**Canonical source**
- `lib/subscriptionPlans.ts` — `SubscriptionTier`, `PLAN_CATALOG`, `PLAN_ORDER`,
  `SubscriptionFeature`, `PlanDefinition.popular`; `LEGACY_TIER_MAP` removed.

**Billing and webhooks**
- `app/api/billing/checkout/route.ts`, `app/api/billing/downgrade/route.ts` — price-ID maps.
- `app/api/webhooks/stripe-billing/route.ts` — `PRICE_ID_TO_TIER`, which currently labels the
  correct price IDs as legacy fallbacks.

**Entitlement callers**
- `lib/billing.ts`, `lib/dashboardUpsell.ts` (`getNextTierRecommendation` must return `null`
  at `small_business` so the hidden tier is never upsold), `app/api/onboarding/route.ts`
  (tier enum), `app/api/settings/{ai,email,schedule,team,templates}/route.ts` (gate copy).

**Presentation**
- `app/(marketing)/pricing/page.tsx` (hardcoded `pricingPlans`, `comparisonFeatures`, and
  SEO metadata), `components/onboarding/OnboardingPlanPicker.tsx` (second hardcoded plan
  array), `components/settings/{TemplatesClient,ScheduleSettingsClient,EmailSettingsClient}.tsx`,
  `components/dashboard/UserMenu.tsx`, `app/admin/(protected)/customers/[userId]/page.tsx`.

**Data**
- `prisma/schema.prisma` — `UserProfile.subscriptionTier` default changes from `"free"` to
  `"starter"`; the stale `// 'free' | 'pro'` comment is corrected. Requires a migration.
- `lib/actions/auth.ts`, `app/api/settings/profile/route.ts`, `scripts/seed-preview.ts`,
  `scripts/verify-seed.ts` — seeded and bootstrapped tier values.

**External**
- Stripe: the three Price objects must carry `tax_behavior: "inclusive"`. This attribute is
  immutable once set to `inclusive` or `exclusive`, so an incorrect value requires new Price
  objects and must be verified before any other work begins.
- Env: `.env.example`, `.env.local.example`, `.env.preview.example`,
  `.env.production.example`, `.github/scripts/check-env-example.sh`, Vercel environments.

**Docs**
- `docs/DDD.md`, `docs/HLD.md`, `docs/runbooks/{README,stripe,openai,resend}.md`,
  `.github/copilot-instructions.md`, `.github/instructions/billing.instructions.md`.

**Tests**
- `tests/subscription-plans.test.ts`, `tests/dashboard-upsell.test.ts`,
  `tests/trial-onboarding.test.ts`.

## Non-goals

- Enforcement semantics for the chased-invoice allowance. This change sets the numbers only;
  counting, warning and pausing behaviour is `monthly-chase-volume-limits`.
- Building multi-user seats, CSV export, approval mode, customer suppression, the weekly
  debtor summary, or customer-specific reminder sequences.
- Migrating or grandfathering existing subscribers — none exist.
