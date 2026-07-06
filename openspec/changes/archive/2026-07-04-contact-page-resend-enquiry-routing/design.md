## Context

The marketing contact page currently collects inbound enquiries, but there is no formally specified backend routing behavior tying enquiry type to internal destination mailbox. The change adds a contract for Resend-backed delivery so sales, support, and accounting-partnership enquiries reach the correct team inboxes.

Constraints:
- Must use the existing Resend integration approach used by PaidSoon server-side email flows.
- Must validate enquiry type at the API boundary and never trust client-provided routing metadata.
- Must keep mapping logic deterministic and easy to audit for future changes.

## Goals / Non-Goals

**Goals:**
- Define a single source of truth mapping from enquiry type to destination email address.
- Ensure `/contact` submissions are delivered via Resend to:
  - Sales -> sales@paidsoon.com.au
  - Support -> support@paidsoon.com.au
  - Accounting Partnerships -> partnerships@padisoon.com.au
- Enforce clear failure semantics for unsupported enquiry types and email-delivery failure.
- Make behavior testable via API-level and unit-level scenarios.

**Non-Goals:**
- Building a full CRM workflow or ticketing system.
- Implementing auto-reply messages to end users.
- Introducing new third-party providers beyond Resend.

## Decisions

1. Use explicit enquiry-type enum validation at route boundary.
Rationale: Prevents invalid or spoofed enquiry types from selecting unintended recipients.
Alternatives considered:
- Free-form string matching in business logic: rejected due to ambiguity and typo risk.
- Client-side-only validation: rejected because server remains vulnerable to crafted requests.

2. Store routing map in server-side code as a static typed record.
Rationale: Deterministic lookup is easy to review and test, and avoids operational drift from ad hoc branching logic.
Alternatives considered:
- Environment-variable-per-type mapping: rejected for this scope because it increases config complexity and weakens compile-time guarantees.
- Database-driven mapping: rejected as unnecessary for fixed, low-cardinality enquiry types.

3. Use existing Resend sending utility wrapper rather than direct SDK calls in route logic.
Rationale: Preserves consistency, observability, and future policy controls around outbound email.
Alternatives considered:
- Calling Resend client directly in route handler: rejected due to duplicated integration logic.

4. Return explicit API errors for unsupported enquiry type and transient send failures.
Rationale: Supports predictable UX and testability while avoiding silent drops.
Alternatives considered:
- Best-effort logging without response signaling: rejected because failures become invisible to users and operators.

## Risks / Trade-offs

- [Risk] Typo or case mismatch in enquiry type input leads to false negatives.
  -> Mitigation: Canonical enum values and schema validation with strict normalization rules.
- [Risk] Destination address typo causes misrouted or bounced messages.
  -> Mitigation: Centralized mapping constant with automated test assertions for all supported types.
- [Risk] Resend outage or API error blocks message delivery.
  -> Mitigation: Fail request with actionable server error response and structured logging for retry/manual follow-up.

## Migration Plan

1. Add mapping and validation in the contact submission backend path.
2. Add requirement-aligned tests for routing and failure paths.
3. Deploy with no data migration required.
4. Rollback by reverting the routing change; no schema rollback needed.

## Open Questions

- Should enquiry type labels be localized in UI while preserving fixed API enum values?
- Should a copy of each enquiry also be sent to an audit mailbox for operational monitoring?
