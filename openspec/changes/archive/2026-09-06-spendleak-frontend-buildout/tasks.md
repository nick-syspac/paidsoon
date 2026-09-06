## 1. Scope and UX Decisions

- [x] 1.1 Confirm launch visibility policy for SpendLeak route (all signed-in users vs feature-gated tiers) and document the chosen rule in this change.
- [x] 1.2 Confirm detail presentation mode (modal, side panel, or sub-route) for long evidence payloads and lock the interaction pattern.
- [x] 1.3 Confirm the authoritative freshness threshold and stale-data copy source for SpendLeak modules.

## 2. Route and Navigation Foundation

- [x] 2.1 Add a dedicated SpendLeak dashboard route under /dashboard with existing authenticated route protections.
- [x] 2.2 Add dashboard navigation entry points to and from SpendLeak surfaces without regressing existing Overview, Invoices, and Resolved routes.
- [x] 2.3 Add baseline loading and error boundaries for the SpendLeak route shell.

## 3. SpendLeak Dashboard Modules

- [x] 3.1 Implement recurring spend module UI with category count, severity, and estimated impact rendering.
- [x] 3.2 Implement duplicate spend module UI with category count, severity, and estimated impact rendering.
- [x] 3.3 Implement renewals module UI with category count, severity, and estimated impact rendering.
- [x] 3.4 Implement supplier concentration module UI with category count, severity, and estimated impact rendering.
- [x] 3.5 Implement cash-pressure module UI with category count, severity, and estimated impact rendering.
- [x] 3.6 Implement explicit empty, initial-sync, stale-data, and partial-data states for all SpendLeak modules.

## 4. Insight Drill-Downs and Lifecycle Controls

- [x] 4.1 Implement finding drill-down entry interactions from each SpendLeak module.
- [x] 4.2 Implement evidence detail rendering (source references, timestamps, rationale) in the selected drill-down pattern.
- [x] 4.3 Implement lifecycle action controls (dismiss/resolve/snooze where supported) with state-based action availability.
- [x] 4.4 Implement success/failure feedback and rollback behavior for failed lifecycle actions.
- [x] 4.5 Implement not-found/unauthorized fallback states for drill-downs and action requests.

## 5. Dashboard Overview Integration

- [x] 5.1 Add a unified financial-operations summary section to dashboard overview that distinguishes cash-in and cash-out signals.
- [x] 5.2 Add overview-to-SpendLeak navigation with context-preserving filters when available.
- [x] 5.3 Verify existing overview severity cards and click-through behavior remain unchanged.

## 6. Verification and Documentation

- [x] 6.1 Add/extend route and component tests for SpendLeak route access, module states, drill-down behavior, and lifecycle action feedback.
- [x] 6.2 Add/extend overview tests for combined financial-operations summary behavior across empty, partial, and populated spend states.
- [x] 6.3 Validate tenant-safe behavior in frontend flows (no cross-tenant leakage in rendered data or action results).
- [x] 6.4 Update docs/DDD.md after implementation is shipped to reflect the new SpendLeak frontend surfaces and route contracts.
