## Context

See proposal.md for motivation. The existing repo already contains the foundation for Cost Guard in the shared financial layer and the active OpenSpec specs define the data and lifecycle model. This design focuses specifically on the UI architecture and product flow needed to make those capabilities usable by a non-accountant owner.

The critical design constraint is that the UI must be explainable and decision-oriented. It should not expose statistical details that owners do not need, but it must preserve enough evidence for users to trust the alert and act on it.

## Goals / Non-Goals

**Goals:**
- Create a coherent Cost Guard module inside PaidSoon with a clear information hierarchy
- Show the most important cost-risk information before deep historical detail
- Make severity, cause, variance, and next steps understandable in plain English
- Support responsive, accessible, and keyboard-surfable interactions for the MVP

**Non-Goals:**
- Replacing the accounting source system or adding AP or procurement workflows
- Building budgets, forecasts, or history pages beyond the basic MVP structure
- Calculating financial logic in the client; the backend remains the source of truth
- Overloading the UI with statistical terminology or raw engine parameters

## Decisions

### D1 — The module follows an action-first layout

The overview page is intentionally optimised for the core owner question: “Is there a problem?” This means the first visible content is cost health, active alerts, forecast position, and spend summary, with historical charts subordinate to the action areas.

Alternative considered: a financial reporting style dashboard with large historical graphs first. Rejected because it can hide the true risk and makes the module feel abstract rather than operational.

### D2 — Severity and plain-English messaging are primary UX primitives

The design uses the severity model already established in the Cost Guard alert foundation: Critical, Warning, Watch, and Information. Each alert card and detail page combines the severity badge with a simple explanation, financial impact, and human-readable reason. Colour is supported but not relied on exclusively.

Alternative considered: exposing raw anomaly scores and threshold names. Rejected because the owner-facing experience should be understandable to a business operator, not a data analyst.

### D3 — Route structure mirrors the user journey, not the data model

Routes are grouped by user tasks rather than by internal data tables: Overview, Alerts, Suppliers, Categories, Rules, and Settings. This keeps the product aligned with how owners think about costs and reduces cognitive load.

Alternative considered: exposing every engine object as a top-level section. Rejected because it would create a more technical, less useful product structure.

### D4 — Detail views include evidence, not just status

Alert detail pages show the baseline, difference, trend, contributing transactions, and next action. This is essential because the user needs to trust the system before taking action.

Alternative considered: minimal dismissive alert panels. Rejected because “why did you flag this?” is the decisive question for active cost-risk features.

### D5 — Settings use business-friendly terms, with advanced thresholds hidden behind a secondary affordance

Settings cards use terms like “alert sensitivity”, “minimum financial impact”, and “new supplier detection” rather than statistical labels. The design keeps the default balanced config simple while still supporting advanced tuning if needed.

Alternative considered: exposing raw threshold values and model parameters in the default surface. Rejected because it would create unnecessary complexity for the MVP.

### D6 — The dashboard and notification centre act as entry points, not duplicate products

The main PaidSoon dashboard and notification centre include compact Cost Guard signals and direct links, but they do not reproduce the full Cost Guard experience. This makes Cost Guard visible without turning the dashboard into a second full module.

Alternative considered: creating a separate replacement dashboard experience. Rejected because the product needs a unified operating view that mixes invoice, spend, and cost risk signals.

## Risks / Trade-offs

- [Alert fatigue] → Mitigate with materiality thresholds, severity hierarchy, and visibility rules that prioritise critical and warning issues before informational content.
- [Over-technical product language] → Mitigate by using plain-language titles, business explanations, and a small number of operational actions rather than raw analytics wording.
- [Too much behaviour in the client] → Mitigate by keeping the UI display-oriented and delegating calculation and data retrieval to the backend API contract.
- [Navigation growth before functionality exists] → Mitigate by keeping the MVP structure focused on Overview, Alerts, Suppliers, Categories, and Rules, with future features deferred.

## Migration Plan

No database migration is required for this change at the UI layer alone. This proposal depends on the existing Cost Guard backend and data model already being present in the repo and in the active OpenSpec foundation work.

Implementation steps:
1. Add the Cost Guard route and navigation structure under the app shell.
2. Build the overview dashboard and summary cards from the existing display-ready APIs.
3. Implement list and detail page patterns for alerts, suppliers, categories, and rules.
4. Add settings screens and management flows.
5. Integrate the main dashboard and notification centre touchpoints.
6. Validate keyboard, responsive, and empty/error-state behaviour before launch.

## Open Questions

- None at the design level; the user story is specific enough to proceed without additional blocking decisions.
