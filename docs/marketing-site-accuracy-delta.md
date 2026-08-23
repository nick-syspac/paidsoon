# Marketing Site Accuracy Delta

**Status:** Findings from a manual audit (2026-08-21) comparing every page under
`app/(marketing)/` against actual implementation (`lib/subscriptionPlans.ts`,
`lib/providers/accounting/`, `docs/go-live-to-do.md`, `docs/DDD.md`). This document
captures gaps only — it is not itself a spec or proposal. Use it as input to an
OpenSpec change before editing the marketing pages.

Per `docs.instructions.md`: **the codebase wins when docs conflict with it.** Every
item below cites the code/doc that establishes ground truth.

---

## 1. Accounting integration status is wrong and inconsistent across pages

Ground truth ([docs/go-live-to-do.md](docs/go-live-to-do.md#L148-L149),
[docs/DDD.md](docs/DDD.md#L816-L825), [lib/providers/accounting/xero.ts](lib/providers/accounting/xero.ts),
[components/settings/AccountingConnectionsClient.tsx](components/settings/AccountingConnectionsClient.tsx)):

| Provider | Actual status | Homepage | `/integrations` | `/roadmap` | `/faq` | `/docs` (marketing) |
|---|---|---|---|---|---|---|
| Stripe Connect | 🟢 Complete | Available ✅ | Available ✅ | (implicit) ✅ | private beta ✅ | Available ✅ |
| Xero | 🟢 **Complete** — full OAuth, sync, pagination, unit-tested | "Coming soon" ❌ | "Available" ✅ | **omitted entirely** ❌ | "planned" ❌ | listed under "Future documentation" ❌ |
| MYOB | 🟡 **Partial** — connect/sync works, narrower field mapping/error handling than Xero | "Early access" ✅ | "Available" ❌ (overstates — should say partial/early access) | "early access" ✅ | "early-access users" ✅ | "early access" ✅ |
| QuickBooks | Not started | "Coming soon" ✅ | "Planned" ✅ | not mentioned (fine, no phase claims it) | "planned" ✅ | "Future documentation" ✅ |

**The core problem:** Xero is the *more* complete integration (per go-live-to-do.md it's
ahead of MYOB), yet three of five marketing surfaces (homepage, roadmap, FAQ, docs) tell
prospects Xero doesn't exist yet, while `/integrations` correctly lists it as available
and additionally mis-labels MYOB as fully "Available" alongside it (no distinction from
Xero's actual completeness).

**Needed changes:**
- Homepage integrations grid ([app/(marketing)/page.tsx](app/(marketing)/page.tsx#L192-L199)): change Xero from "Coming soon" → "Available".
- `/roadmap` "Available / Private beta" list ([app/(marketing)/roadmap/page.tsx](app/(marketing)/roadmap/page.tsx#L11-L20)): add "Xero integration" alongside MYOB.
- `/faq` ([app/(marketing)/faq/page.tsx](app/(marketing)/faq/page.tsx#L11-L14)): rewrite the accounting-software answer — Xero is available, MYOB is early access/partial, QuickBooks is planned.
- `/docs` (marketing) ([app/(marketing)/docs/page.tsx](app/(marketing)/docs/page.tsx#L29-L38)): move "Xero integration" out of `futureDocs` into `currentDocs`.
- `/integrations` ([app/(marketing)/integrations/page.tsx](app/(marketing)/integrations/page.tsx#L9-L24)): change MYOB's description/status to reflect partial support (e.g. "Early access" badge, note narrower field mapping) instead of an unqualified "Available" identical to Xero's.

---

## 2. `/accountants` page describes a feature that does not exist

Ground truth ([lib/subscriptionPlans.ts](lib/subscriptionPlans.ts#L36) —
`multi_client_management` is explicitly listed in `UNIMPLEMENTED_FEATURES`; also stated
directly in `.github/copilot-instructions.md`: *"its partner-specific functionality
(multi-client dashboard, partner programme) is not yet implemented"*).

[app/(marketing)/accountants/page.tsx](app/(marketing)/accountants/page.tsx) presents
multi-client management as a working capability today:

- "Monitor and manage invoice follow-ups for every client from a single PaidSoon account."
- "Onboard new clients quickly with a streamlined connection flow... in minutes."
- "Unlimited clients under one account" / "Multi-client debtor dashboard" listed as a benefit.

None of this exists in the product. This is the most severe finding — it's presenting an
unimplemented feature as available, which `copilot-instructions.md` explicitly forbids
("Never document planned integrations as implemented ones").

**Needed changes:** Either (a) reframe the entire page as "coming soon" / registration-of-interest
for the Accountant Partner programme rather than describing live functionality, or (b) if
the business wants to keep taking Accountant Partner contact-us enquiries now, clearly
mark multi-client management as "planned" the same way the pricing page already does via
`isFeatureImplemented()` / "(coming soon)" suffixes. Consider reusing that same helper here
instead of hand-written marketing copy.

---

## 3. `/features` page has stale tier names and an overstated audit-trail claim

[app/(marketing)/features/page.tsx](app/(marketing)/features/page.tsx):

- Line 21: *"On **Business** plans, use AI..."* — "Business" is a retired tier name.
  Current tiers are `starter` / `solo` / `small_business` / `accountant_partner`
  ([lib/subscriptionPlans.ts](lib/subscriptionPlans.ts#L1-L4); `.github/instructions/billing.instructions.md`
  confirms `STRIPE_BUSINESS_PRICE_ID` "has been retired"). `ai_rewrite` is actually gated
  at `solo` and above, not a "Business" plan.
- Line 45: *"custom branding... on **Business and higher** plans"* — same stale name;
  `custom_sender_name` is Solo+, `verified_from_domain` is Small Business+ — these are two
  different gates being flattened into one wrong tier reference.
- Lines 48–49, "Security and Audit Trail": *"Full audit trail available for dispute
  resolution or business compliance review."* No customer-facing audit trail UI exists —
  the codebase only has `EmailLog` (internal, cron-context) and `AdminAuditEvent` (platform
  admin only, per `lib/admin/`). The `/security` page's own "Audit logging" section is
  worded more carefully (describes internal event recording, not a customer feature/UI) —
  `/features` should match that more modest framing, or this claim should be removed/labelled
  planned.
- The page's meta description also lists "reports" and "accountant visibility" as current
  features — same overstatement as #2 above.

**Needed changes:** Replace "Business" with "Solo" / "Small Business" per the actual
feature gate for each claim (cross-check against `PLAN_CATALOG` in
[lib/subscriptionPlans.ts](lib/subscriptionPlans.ts)), and rewrite the audit-trail card to
match what's actually implemented (internal event logging, not a customer-facing feature).

---

## 4. `/faq` free-trial answer is stale — the trial already shipped

[app/(marketing)/faq/page.tsx](app/(marketing)/faq/page.tsx#L39-L40):

> "Is there a free trial? PaidSoon **plans to offer** a free trial. During private beta,
> access may be limited..."

This is wrong. A 14-day, no-card-required trial is fully implemented
(`components/onboarding/OnboardingPlanPicker.tsx`, `components/dashboard/TrialBanner.tsx`,
archived change `openspec/changes/archive/2026-06-29-signup-trial-onboarding/`), and both
the homepage and `/pricing` already correctly advertise "free trial, no credit card
required." The FAQ page just wasn't updated when the trial shipped.

**Needed change:** Rewrite the FAQ answer to match the homepage/pricing framing (14-day
trial, no card required).

---

## 5. `/faq` cancellation answer is stale — cancellation already works

[app/(marketing)/faq/page.tsx](app/(marketing)/faq/page.tsx#L47-L48):

> "Can I cancel at any time? ... Subscription cancellation details **will be available**
> in account settings **once public billing is enabled**."

`components/settings/SubscriptionClient.tsx` already implements plan-change/downgrade and
"cancel scheduled downgrade" flows against live Stripe billing. This answer should confirm
cancellation is available now (subject to whatever the current private-beta scope actually
is), not describe it as a future capability.

---

## 6. Homepage FAQ overstates who gets a custom domain/sender name

[app/(marketing)/page.tsx](app/(marketing)/page.tsx#L308-L309):

> "Does PaidSoon send emails in my name? Yes. **On paid plans** you can use your own email
> address and domain."

Per `lib/subscriptionPlans.ts` and `.github/instructions/billing.instructions.md`:
- `custom_reply_to` — Solo and above.
- `custom_sender_name` — Solo and above only (not Starter).
- `verified_from_domain` (actual custom **domain** sending) — Small Business and above only.

"On paid plans... your own email address and domain" is only true for Small Business+;
Starter customers use the system sender/address defaults, and Solo customers get a sender name plus reply-to but not a
verified custom domain. This should be corrected to reflect the tiered reality, similar to
how the `/pricing` comparison table already does correctly via `isFeatureImplemented`/`hasPlanFeature`.

---

## 7. Cross-cutting recommendation: drive copy from the plan catalog, not hand-written tier names

`/pricing` ([app/(marketing)/pricing/page.tsx](app/(marketing)/pricing/page.tsx)) already
does this correctly — it imports `getPublicPlans`, `PLAN_CATALOG`, `isFeatureImplemented`
from `lib/subscriptionPlans.ts` so the comparison table can never drift from the real
catalog. `/features`, `/accountants`, homepage FAQ, and marketing `/faq` all use free-hand
prose that references old tier names or unimplemented features and have already drifted.
Where practical, route tier/feature claims on these pages through the same helpers
(`hasPlanFeature`, `isFeatureImplemented`, `planHighlights`) instead of literal strings, so
future plan changes can't silently re-introduce this class of bug.

---

## Summary of pages needing edits

| Page | Issue(s) | Severity |
|---|---|---|
| `app/(marketing)/accountants/page.tsx` | Describes unimplemented multi-client management as live | High |
| `app/(marketing)/page.tsx` (homepage) | Xero status wrong; custom domain/sender overstatement | High / Medium |
| `app/(marketing)/faq/page.tsx` | Xero status wrong; free trial stale; cancellation stale | Medium |
| `app/(marketing)/roadmap/page.tsx` | Xero missing from "Available" list | Medium |
| `app/(marketing)/docs/page.tsx` | Xero listed as future, not current | Medium |
| `app/(marketing)/integrations/page.tsx` | MYOB overstated as equal to Xero | Low/Medium |
| `app/(marketing)/features/page.tsx` | Stale "Business" tier name; overstated audit trail | Medium |

## Not flagged (verified accurate)

- Homepage/roadmap "financial control platform" positioning and Phase 1–4 structure —
  intentional, recently aligned via `openspec/changes/archive/2026-08-21-align-homepage-purpose-and-phased-roadmap/`.
- `/pricing` page — dynamically generated from `lib/subscriptionPlans.ts`, correctly marks
  unimplemented features as "Coming soon."
- Free trial and no-lock-in-contract messaging on homepage/pricing — matches shipped functionality.
- `/security` page's "Audit logging" wording — appropriately scoped to internal event
  recording, doesn't overclaim a customer feature.
