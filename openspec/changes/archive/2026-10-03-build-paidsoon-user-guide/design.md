## Context

See `proposal.md` for motivation. The repository already has a `help-center` capability backed by MDX content under `content/help/`, marketing-shell rendering, and static search. This change extends that baseline to make `/help` a complete, maintainable user guide for PaidSoon.

Constraints:
- Guidance must reflect shipped behavior only and align with plan/feature gates from `lib/subscriptionPlans.ts`.
- Existing help-center architecture (MDX source, routing, search) should be reused rather than replaced.
- The output is documentation and content governance, not a new runtime subsystem.

## Goals / Non-Goals

**Goals:**
- Define a user-guide information architecture with consistent categories and page-level templates.
- Produce a coverage map from core user journeys to concrete guide pages.
- Add quality gates so pages stay aligned to implemented capabilities and remain periodically verified.
- Keep the implementation low-risk by building on existing `content/help/` and help navigation/search behavior.

**Non-Goals:**
- Building new billing, reminder, or integration product functionality.
- Replacing the current help-center framework or route architecture.
- Introducing external CMS/search tooling.
- Authoring admin/runbook content intended for internal operators.

## Decisions

1. Keep the capability under `help-center` and deliver as a spec delta plus content updates.
Rationale: The existing capability already owns user-facing docs behavior; extending it prevents fragmentation.
Alternatives considered:
- Create a new top-level capability for user guides: rejected because it duplicates scope already covered by `help-center`.

2. Organize the guide by customer journey sections rather than by internal code modules.
Rationale: End users navigate by tasks (setup, invoice follow-up, billing) rather than implementation boundaries.
Alternatives considered:
- Organize by technical areas (`lib/**`, route groups): rejected as too internal and harder for customers to use.

3. Use required MDX metadata and a periodic review checklist to enforce freshness.
Rationale: Metadata (`lastVerified`, ownership) gives lightweight governance without introducing new infrastructure.
Alternatives considered:
- Manual ad-hoc review only: rejected because stale docs are hard to detect consistently.

4. Explicitly annotate plan-gated actions in relevant guide pages.
Rationale: PaidSoon has tiered features; guidance without plan context creates support churn and false expectations.
Alternatives considered:
- Keep plan gating only on pricing pages: rejected because users need eligibility context at action time.

## Risks / Trade-offs

- [Risk] Guide claims can drift from product behavior as features evolve. -> Mitigation: require `lastVerified` metadata and scheduled review ownership.
- [Risk] Plan gating language may become outdated after subscription changes. -> Mitigation: verify guide pages against `lib/subscriptionPlans.ts` during review.
- [Risk] Large initial content scope may delay completion. -> Mitigation: prioritize core journey pages first, then expand advanced topics.
- [Trade-off] Reusing existing help infrastructure limits custom documentation workflows. -> Mitigation: accept this for lower complexity and faster delivery.

## Migration Plan

1. Define the canonical user-guide section structure and article list for `content/help/`.
2. Author or revise MDX pages to match the structure and required metadata.
3. Update navigation/search metadata if needed so new sections are discoverable.
4. Perform a capability-accuracy review against current implemented features and plan gates.
5. Validate OpenSpec artifacts and merge content updates.

Rollback strategy:
- If quality issues are found, revert changed MDX pages and navigation metadata while leaving existing help-center behavior intact.

## Open Questions

None.

Resolved in implementation:
- Canonical owner metadata field: `owner`
- Verification freshness window: 60 days from each page's `lastVerified` date
