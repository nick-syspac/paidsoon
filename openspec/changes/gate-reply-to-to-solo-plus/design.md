## Context

See proposal.md - Why. Reply-to is currently enabled for Starter in the plan catalog and enforced consistently across settings UI, settings API, and send-time resolution. The selected product direction is to move Reply-to into Solo+ while keeping a visible but locked Starter UI state to communicate upgrade value.

## Goals / Non-Goals

**Goals:**
- Move `custom_reply_to` entitlement boundary from Starter to Solo.
- Keep Email Settings understandable for Starter users by rendering a disabled Reply-to control with explicit upgrade copy.
- Preserve server-side enforcement as the source of truth.
- Keep outbound email sender resolution aligned with plan entitlement after the boundary shift.
- Update tests and docs so feature-positioning claims remain accurate.

**Non-Goals:**
- Changing sender-name or verified-domain boundaries.
- Changing Stripe billing prices or tier IDs.
- Adding grandfathering rules for existing Starter accounts.
- Introducing a new permission system outside existing plan feature checks.

## Decisions

### D1: Hard entitlement cutoff at Starter
**Decision:** Set Starter `custom_reply_to` to false with no grandfathering.

**Rationale:** This matches the selected immediate policy and keeps entitlement logic simple and explicit.

**Alternatives considered:**
- Grandfather existing Starter Reply-to values: rejected to avoid dual-policy complexity.

### D2: Keep API enforcement authoritative
**Decision:** Continue relying on existing entitlement checks in Email Settings API (`requireFeature`) to reject Starter updates.

**Rationale:** Prevents bypass through direct API calls and avoids UI-only enforcement gaps.

**Alternatives considered:**
- UI-only disable without API rejection: rejected due to bypass risk.

### D3: Starter UI is visible but disabled
**Decision:** Render Reply-to for Starter as a disabled control with clear Solo+ upgrade messaging.

**Rationale:** Preserves discoverability while preventing edits.

**Alternatives considered:**
- Hide field entirely for Starter: rejected because it weakens upgrade signaling.

### D4: Sender resolution remains feature-driven
**Decision:** Keep send-time behavior dependent on `hasPlanFeature(..., "custom_reply_to")`, so Starter no longer emits custom Reply-to once entitlement changes.

**Rationale:** Maintains a single enforcement source shared by settings and outbound email.

## Risks / Trade-offs

- [Risk] Existing Starter users lose a previously-available behavior immediately -> Mitigation: explicit Starter UI messaging and release notes.
- [Risk] Documentation drift causes conflicting product claims -> Mitigation: update all known canonical docs and billing instruction files in the same change.
- [Trade-off] No grandfathering simplifies implementation but may increase support inquiries -> Mitigation: include concise upgrade explanation in Settings copy.

## Migration Plan

1. Update Starter plan feature map (`custom_reply_to=false`).
2. Update Email Settings UI to show disabled Reply-to for Starter with Solo+ messaging.
3. Confirm API and send-time behavior align with updated entitlement boundary.
4. Update tests for plan flags, settings API denial, and UI locked state.
5. Update docs and instruction files that currently describe Reply-to as all paid tiers.
6. Validate with lint, typecheck, tests, and strict OpenSpec validation.

## Open Questions

None.
