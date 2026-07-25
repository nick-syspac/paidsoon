## Context

Three generations of tier naming exist in the repository:

```
Gen 1  free · pro · solo · small_business                     (pre 2026-06-21)
Gen 2  starter $9 · solo $19 · small_business $39             (2026-06-21, still the spec)
Gen 3  starter $19 · business $49 · accountant_partner        (2026-06-26, code only)
Gen 4  starter $9 · solo $19 · small_business $39 · hidden partner   ← this change
```

Gen 3 landed in only two files — `lib/subscriptionPlans.ts` and
`app/(marketing)/pricing/page.tsx`. Every other surface still reflects Gen 2:

| Surface | Generation |
|---|---|
| `PLAN_CATALOG` | Gen 3 |
| Marketing pricing page | Gen 3 |
| Stripe Price objects | Gen 2 ($9 / $19 / $39) |
| `.env.preview.example`, `.env.production.example` | Gen 2 (`SOLO`, `SMALL_BUSINESS`) |
| Settings gate copy | Gen 2 ("Solo or Small Business subscription required") |
| `openspec/specs/subscription-plan-tiers/spec.md` | Gen 2 |

Gen 4 is therefore a completion of the revert, not a forward migration. Four of six surfaces
already hold the target values.

**Constraints**

- The product is pre-launch. No production subscribers exist, so no proration, no
  grandfathering, and no tier-value data migration are required.
- The three Stripe Price objects already exist at the target prices. No new Price objects are
  needed unless `tax_behavior` is wrong.
- Prices are GST-inclusive.
- `accountant_partner` must remain addressable but must not appear in any customer-facing
  plan listing.
- Repository policy forbids presenting unimplemented features as available.

## Goals / Non-Goals

**Goals:**

- Make `lib/subscriptionPlans.ts` the single source of truth for every displayed plan name,
  price, limit and feature boundary.
- Eliminate the price mismatch between the pricing page ($19 Starter) and Checkout ($9).
- Remove alias resolution entirely so tier identifiers have exactly one meaning.
- Re-cut feature gates so the core follow-up workflow is available on every paid tier.
- Bring the deployed spec, the env templates, the docs and the user-facing copy back into
  agreement with the code.

**Non-Goals:**

- Chased-invoice counting, warning and pausing semantics (`monthly-chase-volume-limits`).
- Implementing seats, CSV export, approval mode, suppression lists, the weekly debtor
  summary, or customer-specific sequences.
- Any change to Stripe Connect, the invoice sync pipeline, or the reminder cron.

## Decisions

### 1. Reclaim `solo` and `small_business` as identifiers rather than inventing new ones

`LEGACY_TIER_MAP` currently maps `solo → starter` and `small_business → business`. Reclaiming
those names would be dangerous if any stored profile held them, because the same string would
resolve to a different plan before and after deploy.

Alternatives considered:

| Option | Verdict |
|---|---|
| Reclaim `solo` / `small_business`, delete the alias map | **Chosen.** Pre-launch, so no stored rows can be misread. Matches Stripe, the env vars and the existing spec. |
| Version the identifiers (`solo_v2`) | Rejected — permanent ugliness to solve a problem that only exists post-launch. |
| Neutral identifiers decoupled from marketing names (`tier_1`…) | Rejected — loses the alignment with Stripe env var names and the spec, and forces a display-name lookup everywhere. |

Deleting the map rather than editing it is deliberate: an alias map is precisely the
mechanism that let two generations of names coexist unnoticed. With it gone,
`normalizeSubscriptionTier` returns the default for anything unrecognised, so a stale value
becomes visible as a wrong plan rather than silently resolving to a plausible one.

Verification gate: before deleting, confirm no `user_profiles` row holds a value outside the
new tier set. If any do, they are corrected in the same migration.

### 2. `accountant_partner` stays in the catalog with an explicit visibility flag

Rather than removing the tier (6 files) or filtering it by name at each call site (fragile),
`PlanDefinition` gains a `visibility: "public" | "contact_only"` field. Customer-facing
listings render only `public` plans; the tier remains resolvable by identifier for support
and admin use.

Consequence: `getNextTierRecommendation` in `lib/dashboardUpsell.ts` walks `PLAN_ORDER` and
today returns `accountant_partner` for a Business user. It must return `null` once the
current tier is the highest `public` plan, otherwise a Small Business user near their cap is
upsold to a plan with no price and no Checkout path.

### 3. Presentation derives from the catalog

The marketing pricing page, its SEO metadata, and the onboarding plan picker each hold an
independent hardcoded copy of names, prices and limits. This duplication is the mechanism by
which Gen 3 drifted for a month without anyone noticing.

All three read from `PLAN_CATALOG`. Marketing prose that has no catalog equivalent (audience
descriptions, per-tier benefit phrasing) stays in the page as content keyed by tier id, but
every number and plan name comes from the catalog.

`PlanDefinition` accordingly gains presentational fields — `popular`, `tagline`, and the
per-tier capability labels needed for the comparison table — so that "Most Popular" on Solo
is a catalog fact rather than page markup.

Trade-off: this puts marketing copy into a `lib/` module. Accepted, because the alternative
is demonstrated drift. The boundary held is that `lib/subscriptionPlans.ts` remains free of
JSX and of React imports.

### 4. The sender-identity boolean becomes a three-step ladder

The target matrix distinguishes three sending identities, but the catalog has a single
`own_email_address` boolean. `EmailSettings` already carries `fromEmail`, `fromName`,
`replyTo` and `resendVerified`, so the data model needs no change — only the gate does:

| Tier | Capability | Enforced by |
|---|---|---|
| Starter | PaidSoon from-address, custom reply-to | `custom_reply_to` |
| Solo | custom sender name + reply-to | `custom_sender_name` |
| Small Business | verified custom from-address / domain | `verified_from_domain` + `resendVerified` |

`own_email_address` is replaced by these three features. `lib/email/send.ts`
(`resolveFromAddress`) is the single enforcement point and already reads all four fields.

### 5. Unimplemented capabilities are labelled, not gated

Six advertised capabilities do not exist: multi-user seats, CSV export, approval mode,
customer suppression / do-not-contact, weekly debtor summary, and customer-specific
sequences. The pricing page already sells the weekly summary on Business while
`weekly_summary_email` is `false` in every plan — an existing accuracy gap this change must
not widen.

Each is represented in the catalog by a feature flag that is `false` everywhere plus an
`available: false` marker driving a "Coming soon" label in the comparison table. The flag
records the intended tier boundary so that turning the capability on later is a one-line
change, while the marker keeps the current claim honest.

### 6. GST is a display and Stripe-configuration concern, not a data model change

`monthlyPriceAud` continues to hold the customer-facing figure, now defined as GST-inclusive.
No separate ex-GST field is introduced; Stripe computes the tax component from the Price's
`tax_behavior`.

The Stripe side is the risk. `tax_behavior` is immutable once set to `inclusive` or
`exclusive`, and may be set only once from `unspecified`. If any of the three Prices is
`exclusive`, Checkout charges 10% on top of the advertised figure and the only remedy is a
new Price object plus new env values. This is verified first, before any code is written.

## Risks / Trade-offs

- **A Stripe Price is `tax_behavior: "exclusive"`** → Checkout silently overcharges by 10%
  against a page advertising GST-inclusive pricing. Mitigation: verify all three Prices as
  task 1, before any other work; create replacement Prices and update env values if wrong.
  This is the only irreversible item in the change.

- **A stored `subscriptionTier` value outside the new set** → after `LEGACY_TIER_MAP` is
  deleted it silently resolves to Starter, granting the wrong entitlements. Mitigation:
  audit the column before deletion and correct any stray values in the same migration; the
  seed script and `verify-seed` assert the tier set.

- **`STRIPE_STARTER_PRICE_ID` in a deployed environment points at the Gen-3 $19 price** →
  wrong amount charged. Mitigation: confirm each price ID resolves to the expected amount in
  every Vercel environment, not only locally. Local `.env.local` defines no Stripe variables,
  so this cannot be verified from the development machine alone.

- **Moving marketing copy into `lib/`** → blurs the presentation/logic boundary. Mitigation:
  restricted to plan-scoped strings and numbers; no JSX, no React imports.

- **Feature-flag churn breaks an unrelated gate** → `own_email_address` is referenced by
  `requirePro` in `lib/billing.ts`, retained for backward compatibility. Mitigation: resolve
  every call site during the rename rather than leaving a compatibility shim, and let the
  type system enumerate them.

- **The comparison table becomes catalog-driven and therefore harder to hand-tune** →
  accepted; drift is the more expensive failure.

## Migration Plan

1. Verify `tax_behavior` on all three Stripe Prices. Stop and create replacements if any is
   not `inclusive`.
2. Audit `user_profiles.subscriptionTier` for values outside `{starter, solo, small_business,
   accountant_partner}`.
3. Land the catalog change together with the Prisma migration that changes the column default
   and normalises any stray values.
4. Update env templates and each Vercel environment; remove `STRIPE_BUSINESS_PRICE_ID` and
   `STRIPE_PRO_PRICE_ID`.
5. Update presentation, docs and the deployed spec.

Rollback: revert the commit and restore the two removed env variables. No external state is
mutated other than env values, provided step 1 confirmed the Prices needed no replacement.

## Open Questions

- Does the Small Business comparison row read "3 internal users — coming soon", or is the row
  omitted until seats exist? The decision so far is to show it as forthcoming.
- Should `accountant_partner` retain a `null` price, or carry an indicative "from" figure for
  the contact page?
- The three currently-`false` "available on every plan" capabilities (approval mode,
  suppression, weekly summary) determine how much of the "included in every paid plan"
  message can be made. Is a "Coming soon" label acceptable on a plan's headline promise, or
  should those bullets be withheld entirely until they ship?
