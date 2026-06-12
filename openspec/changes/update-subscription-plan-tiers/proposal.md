## Why

The current subscription packaging does not align with the intended customer segments and feature gating for PaidSoon. Updating plan pricing and entitlements now enables clearer upgrade paths, better value differentiation, and accurate billing expectations.

## What Changes

- Replace the current subscription lineup with three plans: Starter ($9/month), Solo ($19/month), and Small Business ($39/month).
- Define plan-level limits for chased invoices, user seats, and connected Stripe account capacity.
- Define plan-level feature access for reminders, templates, dashboard visibility, branding, email sending identity, tone controls, and AI message rewrite.
- Update subscription presentation and enforcement behavior so users only receive features included in their selected plan.

## Capabilities

### New Capabilities
- `subscription-plan-tiers`: Defines canonical pricing tiers, per-tier limits, and per-tier feature access used by billing and product gating.

### Modified Capabilities

## Impact

- Affected areas include billing/subscription configuration and plan rendering in settings and upgrade flows.
- Likely affected app surfaces include subscription UI, checkout configuration, and any entitlement checks tied to reminders, templates, dashboards, and AI customization.
- May affect Stripe product/price mapping and feature limit enforcement logic.
