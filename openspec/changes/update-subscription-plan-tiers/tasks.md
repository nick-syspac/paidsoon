## 1. Canonical Plan Configuration

- [x] 1.1 Define Starter, Solo, and Small Business plan metadata (IDs, names, monthly prices) in shared billing configuration
- [x] 1.2 Encode per-tier limits for chased invoices, user seats, and connected Stripe accounts in canonical entitlement config
- [x] 1.3 Encode per-tier feature flags for reminders, templates, branding, sender identity, tone settings, and AI rewrite

## 2. Billing and Stripe Mapping

- [x] 2.1 Update Stripe product/price mapping to align each tier with its configured plan identifier
- [x] 2.2 Update checkout/subscription creation paths to use the new tier mapping and persist the correct plan identifier
- [x] 2.3 Add validation/guards for unknown or legacy plan identifiers with safe fallback behavior

## 3. Entitlement Enforcement

- [x] 3.1 Enforce chased-invoice monthly limits server-side according to active tier
- [x] 3.2 Enforce user seat limits during member invite/creation flows according to active tier
- [x] 3.3 Enforce connected Stripe account limits during connect flows according to active tier
- [x] 3.4 Enforce tier-gated feature access for AI rewrite, tone settings, and template capabilities

## 4. UI Updates for Plans and Gated Features

- [x] 4.1 Update subscription and upgrade UI to display Starter ($9), Solo ($19), and Small Business ($39) with correct limits/features
- [x] 4.2 Update settings/dashboard UI to show or hide payment status and overdue modules based on active tier
- [x] 4.3 Add clear upgrade messaging when users hit tier limits or access unavailable capabilities

## 5. Verification and Rollout

- [x] 5.1 Add or update tests for plan catalog rendering and entitlement checks across all three tiers
- [ ] 5.2 Validate staging flows for signup/checkout, upgrades/downgrades, and limit enforcement
- [ ] 5.3 Run production rollout checklist including monitoring for checkout, webhook sync, and entitlement mismatches
