# PaidSoon release-readiness audit

## Executive verdict

No — PaidSoon is not yet genuinely ready to be released to paying customers as a general public SaaS launch.

This repo is not a scaffold. It contains real implementation across auth, routing, plan gating, Stripe billing, reminder orchestration, Xero/MYOB accounting connections, invoice export, and a substantial test suite. The fresh validation stack also passed: `npm run lint && npx tsc --noEmit && npm test && npm run build` completed successfully.

That said, “passes build/tests” is not the same as “release-ready for paying customers.” The codebase still contains partial features, intentionally deferred product work, and release-risk areas that must be treated as product gaps rather than assumptions. The right verdict is:

- Strong evidence of working product core
- Not yet complete enough for a public paid launch without explicit feature gating and operational controls
- Better described as a beta-to-near-release product, not a fully finished customer-facing SaaS

---

## Release decision

### Verdict: conditional no-go for broad public paid launch

Reasons:

1. The code explicitly marks several features as not yet implemented in the canonical plan catalog at [lib/subscriptionPlans.ts](../lib/subscriptionPlans.ts).
2. Some product flows exist as scaffold-only endpoints and do not persist real state, notably the team invite flow at [app/api/settings/team/invite/route.ts](../app/api/settings/team/invite/route.ts).
3. The repo still contains operational complexity and production dependencies that are not automatically validated by the local test suite: live Stripe webhooks, live Supabase/Postgres configuration, external accounting integrations, and worker scheduling.
4. The project is intentionally split between a real product and a set of deferred/partial capabilities, so release is only acceptable if those unfinished capabilities are hidden from customers or kept behind controlled internal rollout.

---

## What is genuinely working

These areas are substantively implemented rather than merely mocked or documented:

- Auth and route protection are enforced in the middleware/proxy layer: [proxy.ts](../proxy.ts)
- The app enforces pre-launch auth blocking and dashboard protection via the live-mode infrastructure: [lib/liveMode.ts](../lib/liveMode.ts)
- The canonical plan catalog and feature gating are real and explicit: [lib/subscriptionPlans.ts](../lib/subscriptionPlans.ts)
- The reminder sending engine is implemented in the cron route and uses real email send + dedup logic: [app/api/cron/send-emails/route.ts](../app/api/cron/send-emails/route.ts), [lib/email/send.ts](../lib/email/send.ts)
- Billing and plan logic are implemented with Stripe integration and entitlement checks: [lib/billing.ts](../lib/billing.ts)
- Xero and MYOB connection logic are implemented in provider modules rather than placeholders: [lib/providers/accounting/xero.ts](../lib/providers/accounting/xero.ts), [lib/providers/accounting/myob.ts](../lib/providers/accounting/myob.ts)
- CSV/XLSX export logic is real and includes safeguards: [lib/invoices/export.ts](../lib/invoices/export.ts)
- RLS-oriented DB access patterns are explicit and documented: [lib/db/withUserContext.ts](../lib/db/withUserContext.ts) and the project guidance in [.github/copilot-instructions.md](../.github/copilot-instructions.md)

The test suite also includes strong evidence of real business logic coverage; the fresh run showed many passing cases for reminder logic, Stripe billing, plan catalog behavior, auth bootstrap, Xero, and environment protection rules.

---

## Explicit product gaps that matter for release

### 1) Intentionally unimplemented features remain in the product catalog

The canonical plan logic explicitly contains a list of unfinished features and says they must be rendered as “Coming soon” rather than as live capabilities:

- [lib/subscriptionPlans.ts](../lib/subscriptionPlans.ts)

Key examples:

- `customer_specific_sequences`
- `multi_template_customer_wording`
- `approval_mode`
- `contact_suppression`
- `team_seats`
- `multi_client_management`

This is not a hidden bug; it is an intentional product state. The code is telling us that the app still contains planned-but-not-live functionality and that the product must not present those capabilities as implemented.

### 2) The team-seat flow is scaffold-only, not a real production feature

The invite route validates input and returns a success object, but it does not persist invitations or create a real team-membership model:

- [app/api/settings/team/invite/route.ts](../app/api/settings/team/invite/route.ts)

The comment in the file explicitly says:

> “Scaffold behavior: persistence is intentionally deferred until team-membership model exists.”

That is a real dead-end workflow, not a minor implementation detail. If team seats are customer-facing, they are not ready.

### 3) Some customer-facing features are intentionally gated behind hidden or future product definitions

The plan catalog distinguishes public plans from the hidden `accountant_partner` contact-only tier. The project policy is clear that this tier is intentionally excluded from public pricing and onboarding flows.

This is not inherently a problem, but it means the app still contains a meaningful “future product” lane rather than a single fully shipped commercial scope.

---

## Operational risk that still makes launch non-trivial

### 1) Production environment complexity is real and not lightweight

The runbook is extensive and describes a multi-system release path involving:

- Supabase Auth and Postgres/RLS
- Stripe Connect + Billing
- Resend email delivery
- Vercel deployment and cron
- optional worker/Redis scheduling
- Xero/MYOB OAuth flows
- admin security requirements

See [docs/runbooks/README.md](../docs/runbooks/README.md).

This is not a simple “one-click launch” app. It is a real SaaS deployment with operational dependencies that must be configured correctly in production.

### 2) The product depends on live external systems, not only code correctness

Even with passing local validation, the real production risk remains in areas such as:

- webhook signature verification and routing
- Stripe customer billing states
- Sendgrid/Resend delivery and from-address verification
- accounting connection OAuth flow and token refresh
- worker/cron health and scheduling drift

The repo does contain safeguards and tests for many of these, but they are still live-service concerns, not purely unit-tested behavior.

---

## What the evidence says overall

### Strong yes

The repo is clearly not “fake.” It has real product logic and a lot of implementation maturity in key areas:

- live path protection
- subscription tier logic
- Stripe billing handling
- reminder email engine
- accounting integration code
- DB access isolation patterns
- extensive tests

### Strong no

The repo is also not a fully finished public SaaS release in the sense of “no customer-visible gaps remain.” The product includes planned-but-not-live features and at least one scaffold-only team workflow. That means a release should not be framed as “all features are done.”

---

## Recommended release posture

### Recommended status: “not ready for broad paying-customer launch yet”

If the team wants to release now, the safest path is:

1. ship only the proven core workflow
2. hide or disable incomplete customer-facing features immediately
3. keep the feature catalog aligned to reality
4. treat the remaining roadmap items as post-launch work, not part of the release promise

In other words: the app is credible enough to be a controlled beta or limited rollout, but not yet a clean general-purpose release to the market as a complete paid product.

---

## Final conclusion

This codebase is materially implemented and passes the repo’s validation stack, but it is still not a fully honest “ready for paying customers” release.

The right conclusion is: viable product core, real implementation, real tests, but still some intentionally incomplete product capabilities and operational dependency risk. The product should not be sold as fully complete until the partial workflows are either finished or actively excluded from customer-visible scope.
