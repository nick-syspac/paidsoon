## Context

See proposal.md - Why. The current Team settings surface is interactive even though Team seat persistence is explicitly scaffolded. The plan catalog already distinguishes entitlement (`hasPlanFeature`) from implementation state (`isFeatureImplemented` via `UNIMPLEMENTED_FEATURES`), but Team settings currently does not enforce that distinction consistently across navigation, page UI, and API responses.

## Goals / Non-Goals

**Goals:**
- Enforce a single behavior contract: entitled-but-unimplemented features are visible but non-actionable.
- Apply this contract to Team settings and Team invite API with deterministic, non-success unavailable responses.
- Keep plan seat-limit context visible without implying operational team membership.
- Add regression coverage so scaffold workflows cannot silently reappear as actionable.

**Non-Goals:**
- Implementing team membership, invitation persistence, or multi-user account roles.
- Changing pricing, plan IDs, or Stripe billing behavior.
- Enabling other unimplemented feature workflows in this change.

## Decisions

### D1: Use implementation state to gate actionability
**Decision:** Introduce page/API behavior that checks implementation state for `team_seats` and blocks operational actions when unimplemented.

**Rationale:** Entitlement and implementation are distinct concepts in the catalog. Actionability must require both.

**Alternatives considered:**
- Hide Team entirely for all users until implementation. Rejected for now because retaining a read-only surface preserves plan context and roadmap clarity.
- Keep current scaffold submit behavior with disclaimer text. Rejected because success-like responses still imply completed work.

### D2: Keep Team tab visibility, but render read-only coming-soon UI
**Decision:** Keep Team settings discoverable while unimplemented, but remove or disable invite submission controls and present explicit coming-soon state.

**Rationale:** Preserves tier context (`userSeats`) without exposing non-functional actions.

**Alternatives considered:**
- Conditional tab visibility only for tiers with `team_seats` entitlement. Deferred; can be layered later without changing this contract.

### D3: Return deterministic API unavailability responses
**Decision:** Team invite endpoint returns a stable unavailable response (non-2xx) with a machine-readable reason code while feature is unimplemented.

**Rationale:** Prevents clients from treating scaffold responses as successful operations and enables consistent UI messaging.

**Alternatives considered:**
- Return 200 with warning payload. Rejected because success semantics are ambiguous and encourage misuse.

### D4: Test actionability contract explicitly
**Decision:** Add tests for Team page behavior and Team invite endpoint behavior under unimplemented state.

**Rationale:** The catalog-level flag can drift from UI/API behavior unless verified by tests.

## Risks / Trade-offs

- [Risk] Users may perceive reduced functionality if they previously saw an invite form -> Mitigation: Explicit coming-soon copy that explains current state and preserves seat context.
- [Risk] Existing client logic may assume success-like payload shape -> Mitigation: Introduce stable unavailable reason code and update client handling in the same change.
- [Trade-off] Team remains visible before implementation -> Mitigation: Keep messaging explicit and all actions disabled/non-operational.

## Migration Plan

1. Update Team settings server/client surfaces to render non-actionable state when `team_seats` is unimplemented.
2. Update Team invite API route to return deterministic unavailable responses while unimplemented.
3. Add/adjust tests for UI/API contract and reason-code handling.
4. Validate with lint/typecheck/tests.
5. Deploy with no data migration (behavioral change only).

## Open Questions

None.
