## Context

PaidSoon already has MYOB Business routes, provider code, sync orchestration, user settings UI, admin visibility, and draft accounting-integration OpenSpec artifacts. The remaining launch risk is not broad feature absence but the gap between code presence and production supportability.

The current MYOB path has three readiness pressures:

- A successful OAuth callback is not yet equivalent to a successful data-collection outcome, because first sync behavior and first-sync visibility need to be explicit.
- MYOB company-file identity needs to be support-friendly, with stable identifiers and readable names that survive callback edge cases.
- Operations and support need a documented go-live contract that defines when MYOB is blocked, beta-ready, or production-ready, including environment variables and pass/fail gate criteria.

This change is intentionally narrower than the broader `add-accounting-integrations` change. It does not reopen the full accounting architecture. It hardens the existing MYOB path and documents the launch contract required to ship it responsibly.

## Goals / Non-Goals

**Goals:**

- Make the MYOB Business connection lifecycle production-ready from connect through first sync.
- Ensure MYOB connection status distinguishes authorisation, first-sync pending, active, revoked, disconnected, and error states wherever operators or users need to act.
- Ensure company-file metadata is stable and supportable.
- Document all MYOB-related environment variables and validation steps in the canonical runbooks.
- Define explicit go-live gates with pass/fail criteria and remediation expectations for MYOB rollout.

**Non-Goals:**

- Reworking the Xero integration.
- Replacing the existing accounting sync architecture.
- Adding new billing tiers or entitlement models.
- Adding webhook-based MYOB sync.
- General marketing-site cleanup beyond MYOB launch-state alignment.

## Decisions

### D1. Treat MYOB launch readiness as a hardening change, not a new integration build

The repository already contains a substantial MYOB implementation surface. This change SHALL build on that surface instead of proposing a second integration track.

**Why:** Reframing the work as launch hardening keeps the tasks small, testable, and directly tied to shipping risk.

**Alternative considered:** Fold this work back into `add-accounting-integrations`. Rejected because that change is broader than the remaining MYOB-specific launch work and would obscure what still blocks release.

### D2. Connection success must include explicit first-sync state

The MYOB connection lifecycle SHALL not stop at token exchange and row creation. After callback, the system must either complete a first sync or place the connection into an explicit pending/error state visible to both the user and operators.

**Why:** "Connected" without imported data is operationally ambiguous and creates false confidence.

**Alternative considered:** Keep the existing success redirect and rely on cron/manual sync. Rejected because it weakens user trust and complicates support triage.

### D3. Company-file identity must be stable, readable, and support-friendly

The system SHALL persist the MYOB `businessId` / company-file URI as the stable identifier while also resolving and storing a readable organisation name whenever available. If resolution fails, the fallback name must still be deterministic and recognizable in support tooling.

**Why:** Raw callback URIs are sufficient for machines but weak for users, operators, and audit trails.

**Alternative considered:** Keep URI-only naming. Rejected because it makes admin support and launch validation unnecessarily brittle.

### D4. Reuse the existing sync and admin surfaces instead of creating new operational paths

The hardening work SHALL extend the current sync orchestrator, user integrations page, admin integrations view, and admin resync action rather than introducing parallel tooling.

**Why:** Existing surfaces already align with the accounting model and are the most direct places to expose readiness and failure state.

**Alternative considered:** Build a MYOB-specific admin console or runbook-only validation flow. Rejected because it fragments operational behavior.

### D5. Go-live readiness must be documented as explicit gates with pass/fail criteria

MYOB launch readiness SHALL be documented in canonical runbooks as named gates with objective pass/fail conditions, not narrative guidance alone.

Required gate families:

- Environment and secret completeness
- MYOB sandbox connection validation
- First-sync and invoice-mapping validation
- Observability and support readiness
- Documentation and rollout messaging alignment

**Why:** A gate model makes release decisions auditable and reduces ambiguity between beta and supported launch.

**Alternative considered:** Keep freeform checklist prose. Rejected because it is harder to verify and easier to bypass.

## Risks / Trade-offs

- **Longer callback-to-ready path** → Mitigate by distinguishing connection-authorised from connection-ready states instead of pretending sync has already succeeded.
- **MYOB sandbox behavior may differ from mocks** → Mitigate by making real sandbox validation a required launch gate.
- **Documentation drift across `.env.example`, runbooks, and launch checklists** → Mitigate by naming a canonical source and adding explicit documentation-alignment tasks.
- **Support burden if status meanings are unclear** → Mitigate by standardizing user/admin-visible statuses and matching runbook language.
- **Follow-up scope creep into full accounting cleanup** → Mitigate by keeping this change limited to MYOB readiness and launch documentation.

## Migration Plan

1. Implement MYOB lifecycle hardening changes behind the existing integration surface.
2. Validate the hardened flow against a real MYOB sandbox before public rollout.
3. Update canonical environment-variable and go-live documentation in the same delivery window.
4. Align user-facing and operator-facing launch messaging with the validated rollout state.
5. Roll back by disabling MYOB connect entry points or marking MYOB as unsupported if any gate fails after deployment.

## Open Questions

- Should first sync run inline during callback completion, or should callback persist a `pending_first_sync` state and dispatch the sync asynchronously?
- Do we need a distinct user-facing status for "authorised but not yet validated" separate from generic `active`?
- Which document should become the single canonical go-live checklist for MYOB: the existing go-live runbook change, a service runbook, or a dedicated MYOB launch page?