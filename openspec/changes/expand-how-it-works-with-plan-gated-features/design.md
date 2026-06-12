## Context

The homepage currently presents a three-card reminder timeline in the "How it works" section. While it communicates escalation timing, it does not surface two meaningful value points already reflected in plan packaging: template-driven reminders and AI-assisted rewrites. This creates a messaging gap between product capabilities and conversion copy.

The requested change is content-and-UI level only and should remain within the landing page implementation in app/page.tsx. Existing pricing cards already describe plan differences; this design adds complementary guidance in the workflow section with a compact asterisk convention for higher-plan features.

## Goals / Non-Goals

**Goals:**
- Expand "How it works" to include reminder templates and AI integration as explicit workflow elements.
- Mark higher-plan-only workflow elements with a small asterisk.
- Add clear explanatory copy that the asterisk denotes higher plans.
- Preserve readability on desktop and mobile.

**Non-Goals:**
- No changes to authentication, billing, or entitlement enforcement logic.
- No changes to plan definitions in lib/subscriptionPlans.ts.
- No redesign of the full pricing section.

## Decisions

1. Keep the change localized to the existing landing page component.
- Decision: Implement the updated "How it works" content directly in app/page.tsx.
- Rationale: The section is already static content in this file, so a localized edit minimizes risk and avoids unnecessary abstractions.
- Alternative considered: Extract a dedicated component for workflow cards. Rejected for now because this is a single-scope content update.

2. Represent higher-plan features with text-level asterisk markers.
- Decision: Append a small asterisk to card titles or labels for higher-tier steps.
- Rationale: Asterisk notation is concise, familiar, and low-visual-noise in marketing sections.
- Alternative considered: Badges like "Pro" or "Small Business" on each card. Rejected to avoid visual clutter and hard-coding plan labels in multiple places.

3. Add one legend sentence below the cards.
- Decision: Add explanatory microcopy immediately under the workflow grid clarifying that "*" indicates higher-plan availability.
- Rationale: Keeps interpretation close to where markers appear and avoids ambiguity.
- Alternative considered: Tooltip interaction. Rejected to keep behavior accessible and static without client-side scripting.

4. Preserve the existing reminder-sequence narrative while expanding scope.
- Decision: Keep escalation flow language and add templates/AI as part of the same lifecycle narrative.
- Rationale: Maintains continuity with current positioning and reduces copy churn.
- Alternative considered: Replace timeline with a generic feature list. Rejected because the sequence framing is core to product understanding.

## Risks / Trade-offs

- [Risk] Asterisk markers may be missed by some users. -> Mitigation: keep marker adjacent to the specific item and include a clear legend line.
- [Risk] Marketing copy may imply entitlement details not enforced on this page. -> Mitigation: phrase the legend as availability guidance and keep exact enforcement in authenticated product areas.
- [Trade-off] Keeping content inline in app/page.tsx is fast but less reusable. -> Mitigation: acceptable for this limited, single-page scope.
