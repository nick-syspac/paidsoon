## Why

`/accountants` markets multi-client management as a working capability today: "Monitor and manage invoice follow-ups for every client from a single PaidSoon account," "streamlined client onboarding... in minutes," "Multi-client debtor dashboard." None of this exists — `multi_client_management` is explicitly listed in `UNIMPLEMENTED_FEATURES` in `lib/subscriptionPlans.ts`, and `.github/copilot-instructions.md` states the Accountant Partner tier's "partner-specific functionality (multi-client dashboard, partner programme) is not yet implemented." This is the most severe gap found in the marketing accuracy audit: a page actively promising a self-serve capability that a prospective partner cannot use if they sign up today.

## What Changes

- Reframe `/accountants` from "here is a working multi-client tool" to an early-access / register-interest page for the Accountant Partner programme: what's planned, why it's valuable, and how to register interest — not a description of a live dashboard.
- Remove or clearly relabel (as planned/coming soon) the specific claims of live multi-client management, multi-client debtor dashboard, and self-serve client onboarding flow.
- Keep the existing "Contact us" / partnership enquiry path (already routed correctly via `contact-enquiry-routing`'s `Accounting Partnerships` type) as the only call to action — no new self-serve flow is introduced.
- Update the page's `Metadata` description so it no longer states the Accountant Partner programme helps "manage invoice follow-ups for all their clients from one dashboard" as a present-tense capability.

## Capabilities

### New Capabilities
- `marketing-accountant-partner-page`: Defines what `/accountants` may claim about Accountant Partner programme capabilities given current implementation status, distinguishing between what's live (contact-us enquiry routing, single-client invoice follow-up automation a bookkeeper could use per-client today) and what's planned (multi-client dashboard, unified multi-client management).

### Modified Capabilities
- None.

## Impact

- **Affected code**: `app/(marketing)/accountants/page.tsx` only (copy and metadata).
- **No API changes, no schema changes, no billing/auth/RLS changes.**
- **No environment variable changes.**
- No change to `contact-enquiry-routing` behavior — the existing "Accounting Partnerships" enquiry type and routing stay as-is.
