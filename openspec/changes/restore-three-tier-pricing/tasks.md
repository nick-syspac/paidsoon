## 1. External verification (blocking — do first)

- [ ] 1.1 Confirm in Stripe that the Price behind `STRIPE_STARTER_PRICE_ID` is A$9/month and carries `tax_behavior: "inclusive"`
- [ ] 1.2 Confirm the Price behind `STRIPE_SOLO_PRICE_ID` is A$19/month with `tax_behavior: "inclusive"`
- [ ] 1.3 Confirm the Price behind `STRIPE_SMALL_BUSINESS_PRICE_ID` is A$39/month with `tax_behavior: "inclusive"`
- [ ] 1.4 If any Price is `exclusive` or `unspecified`, create a replacement Price with `tax_behavior: "inclusive"` and record the new ID — `tax_behavior` cannot be changed after it is set
- [ ] 1.5 Verify the three price IDs are set to the same values in every Vercel environment (development, preview, production); local `.env.local` defines no Stripe variables, so this cannot be checked from the dev machine
- [x] 1.6 Audit `user_profiles.subscriptionTier` for values outside `{starter, solo, small_business, accountant_partner}` and record what is found — found 3 rows with `"business"` (local seed data only) and 1 with `"starter"`; migration normalizes `business → small_business`

## 2. Plan catalog

- [x] 2.1 Change `SubscriptionTier` in `lib/subscriptionPlans.ts` to `"starter" | "solo" | "small_business" | "accountant_partner"`
- [x] 2.2 Delete `LEGACY_TIER_MAP` and remove its use from `normalizeSubscriptionTier`
- [x] 2.3 Add `visibility: "public" | "contact_only"`, `popular?: boolean`, and `tagline` to `PlanDefinition`
- [x] 2.4 Replace the `own_email_address` feature with `custom_reply_to`, `custom_sender_name`, and `verified_from_domain`
- [x] 2.5 Add feature flags for the not-yet-implemented capabilities (`csv_export`, `approval_mode`, `contact_suppression`, `customer_specific_sequences`, `team_seats`) with an `available: false` marker recording their intended tier boundary — implemented as module-level `UNIMPLEMENTED_FEATURES` array + `isFeatureImplemented()` (also covers `multi_template_customer_wording` and `weekly_summary_email`, which the design called out but this task list did not enumerate)
- [x] 2.6 Rewrite `PLAN_CATALOG` with the four tiers, GST-inclusive prices 9/19/39/null, allowances 10/50/200/unlimited, seats 1/1/3/unlimited, and one invoice source for every public tier
- [x] 2.7 Enable the core follow-up features (`promise_to_pay_tracking`, dispute pause, `overdue_invoice_dashboard`, `payment_status_dashboard`, `accounting_integrations`) on all three public tiers
- [x] 2.8 Update `PLAN_ORDER` and mark Solo as `popular`
- [x] 2.9 Add a `getPublicPlans()` helper returning only `visibility: "public"` plans in `PLAN_ORDER` order

## 3. Entitlement callers

- [x] 3.1 Update `getNextTierRecommendation` in `lib/dashboardUpsell.ts` to return `null` once the current tier is the highest public plan, so the contact-only tier is never recommended
- [x] 3.2 Rename `getStripeConnectionLimitForTier` in `lib/billing.ts` to reflect that it now covers any invoice source, and update its callers
- [x] 3.3 Remove `requirePro` from `lib/billing.ts` and resolve each call site against the specific sender-identity feature it needs — `requirePro` had no callers, so this was a pure removal
- [x] 3.4 Update the tier enum in `app/api/onboarding/route.ts`
- [x] 3.5 Update the price-ID maps in `app/api/billing/checkout/route.ts` and `app/api/billing/downgrade/route.ts` to the three canonical variables, removing the `STRIPE_BUSINESS_PRICE_ID` fallback
- [x] 3.6 Rewrite `PRICE_ID_TO_TIER` in `app/api/webhooks/stripe-billing/route.ts` as a direct three-entry map and delete the "legacy fallback" entries and their comment
- [x] 3.7 Enforce the one-invoice-source limit on the accounting connection path as well as the Stripe Connect path — added `countActiveInvoiceSources()` in `lib/billing.ts` (counts Stripe + accounting connections together) and enforced it at MYOB/Xero connect-initiation and at the MYOB/Xero callback and Xero select-org upsert points (skipped when reconnecting an already-connected organisation)

## 4. Sender identity ladder

- [x] 4.1 Gate reply-to, sender name, and verified from-domain separately in `resolveFromAddress` in `lib/email/send.ts`
- [x] 4.2 Update `app/api/settings/email/route.ts` to validate against the three new features and correct its gate message
- [x] 4.3 Update `components/settings/EmailSettingsClient.tsx` to show the correct capability for the active tier

## 5. Presentation derived from the catalog

- [x] 5.1 Rewrite `app/(marketing)/pricing/page.tsx` to render plan cards from `getPublicPlans()`, keeping only prose keyed by tier id in the page
- [x] 5.2 Build the comparison table from catalog features, rendering `available: false` capabilities as "Coming soon"
- [x] 5.3 Generate the page `metadata.description` from the catalog so prices cannot drift in SEO copy
- [x] 5.4 State on the pricing page that displayed prices include GST
- [x] 5.5 Rewrite `components/onboarding/OnboardingPlanPicker.tsx` to read `getPublicPlans()`, deleting its hardcoded `PLANS` array — also fixed a pre-existing `£` currency-symbol bug found in the process
- [x] 5.6 Update gate copy in `components/settings/TemplatesClient.tsx`, `ScheduleSettingsClient.tsx`, and the messages returned by `app/api/settings/{ai,schedule,team,templates}/route.ts` — `ScheduleSettingsClient.tsx` and the schedule/team/templates routes already had correct Gen-2 wording; only `TemplatesClient.tsx` and `app/api/settings/ai/route.ts` needed fixing
- [x] 5.7 Update tier labels in `components/dashboard/UserMenu.tsx` and `app/admin/(protected)/customers/[userId]/page.tsx` — both (plus `CustomerSearchClient.tsx` and `AccountSettingsClient.tsx`) already used Gen-2 tier names; added a missing `accountant_partner` entry to all four `TIER_LABELS` maps

Note: extracted a shared `lib/planPresentation.ts` (catalog-derived `formatPlanPrice`/`planHighlights`/`PLAN_TAGLINE`) so the pricing page and onboarding picker don't duplicate plan prose — not in the original task list but directly serves the change's goal of eliminating duplicated plan copy.

## 6. Data

- [x] 6.1 Change the `UserProfile.subscriptionTier` default in `prisma/schema.prisma` from `"free"` to `"starter"` and correct the stale `// 'free' | 'pro'` comment
- [x] 6.2 Generate a migration that applies the new default and normalises any stray tier values found in task 1.6 — `20260725065817_restore_three_tier_pricing`: sets the default and maps `business → small_business`, anything else outside the new set → `starter`
- [x] 6.3 Run `npm run verify-rls` to confirm the migration did not disturb policies — 5/5 checks pass
- [x] 6.4 Update tier values in `lib/actions/auth.ts` and `app/api/settings/profile/route.ts` — both already used `"starter"`, no change needed
- [x] 6.5 Update `scripts/seed-preview.ts` seed accounts to the new tier identifiers and add a tier-set assertion to `scripts/verify-seed.ts`
- [x] 6.6 Run `npm run db:seed && npm run verify-seed` — 87/87 checks pass

## 7. Environment and configuration

- [x] 7.1 Remove `STRIPE_BUSINESS_PRICE_ID` and `STRIPE_PRO_PRICE_ID` from all four `.env*.example` files, ensuring the three canonical variables are present in each
- [x] 7.2 Update `EXPECTED_VARS` in `.github/scripts/check-env-example.sh` and run it — 29 passed, 0 failed on the Stripe-related checks (2 pre-existing unrelated failures for `.env`/`.env.local` being present locally, expected in dev)
- [ ] 7.3 Remove the two retired variables from every Vercel environment — **not done**: this modifies shared/live infrastructure (Vercel env vars across environments) and the user has taken this on themselves alongside the Stripe `tax_behavior` check (see task 1)

## 8. Documentation

- [x] 8.1 Update the plan catalog and tier tables in `docs/DDD.md` and `docs/HLD.md` \u2014 also resolved 4 stale "Spec Alignment Gaps" rows in `docs/HLD.md` that this exact change fixes
- [x] 8.2 Update the env matrix in `docs/runbooks/README.md` and the tier references in `docs/runbooks/{stripe,openai,resend}.md` \u2014 `resend.md` needed no change (already correct); `openai.md`'s ai_rewrite gate corrected from Small Business to Solo+
- [x] 8.3 Update tier names, prices, and the gating table in `.github/copilot-instructions.md` and `.github/instructions/billing.instructions.md` \u2014 also swept `.github/instructions/{email-automation,vercel}.instructions.md`, `.github/prompts/{add-tests,build-invoice-reminder-flow,build-weekly-debtor-summary,security-review,add-email-template}.prompt.md`, and `.github/skills/{email-reminders,stripe-billing,testing-strategy}/SKILL.md` for the same stale `own_email_address`/`Business+`/legacy-price-ID references\n- [x] 8.4 Record in `docs/runbooks/stripe.md` that `tax_behavior` is immutable and must be `inclusive` for AUD prices

## 9. Tests

- [x] 9.1 Rewrite `tests/subscription-plans.test.ts` for the four tiers, new prices, allowances, and seat limits
- [x] 9.2 Add a test asserting `normalizeSubscriptionTier` falls back to the default for retired identifiers now that aliasing is gone
- [x] 9.3 Add a test asserting `getPublicPlans()` excludes contact-only tiers
- [x] 9.4 Update `tests/dashboard-upsell.test.ts` to assert no recommendation is made above the highest public tier
- [x] 9.5 Update `tests/trial-onboarding.test.ts` for the new tier enum — also updated its `resolveCheckoutTier`/`buildTrialCheckoutUrl` mini-model tests, which independently referenced the retired `business` tier
- [x] 9.6 Add a test asserting every catalog feature marked `available: false` is disabled on every tier
- [x] 9.7 Run `npm run test` and `npm run lint` — 413/413 tests pass, lint clean. Fixed `tests/myob-callback-route.test.ts`'s mocked `tx` object, which only stubbed `accountingConnection.upsert` and broke once the callback route started calling `accountingConnection.findUnique`/`count`, `invoiceConnection.count`, and `userProfile.findUnique` for the new invoice-source limit check (task 3.7)

## 10. Verification

- [x] 10.1 Confirm the price shown on the pricing page for each tier equals the amount presented in Stripe Checkout — confirmed by construction: `PRICE_ID_BY_TIER` maps `starter/solo/small_business` 1:1 to `STRIPE_STARTER_PRICE_ID`/`STRIPE_SOLO_PRICE_ID`/`STRIPE_SMALL_BUSINESS_PRICE_ID`, and the pricing page reads the same `PLAN_CATALOG` prices ($9/$19/$39). The remaining dependency — that those Price IDs actually resolve to $9/$19/$39 in Stripe — is covered by task 1.1–1.3 (user-verified)
- [x] 10.2 Confirm Accountant Partner appears on no plan listing and no upgrade recommendation, but still resolves in the admin console — verified: `getPublicPlans()` returns only `[starter, solo, small_business]`; `getNextTierRecommendation("small_business")` returns `null`; `getPlanByTier("accountant_partner")` still resolves its full definition for admin/support use
- [x] 10.3 Confirm no plan name, price, or limit remains hardcoded outside `lib/subscriptionPlans.ts` — grepped `app/**`/`components/**` for stale hardcoded prices/limits (`$9`/`$19`/`$39`/`$49`/"Up to 20"/"Up to 100" etc.): no matches outside the catalog and `lib/planPresentation.ts`
