## Context

The admin space is currently the operational fallback for product support and debugging, but it does not fully represent all of the active modules in the system. New capabilities were added incrementally, and some of them became visible only inside their own feature area rather than from the shared admin surface. The result is fragmented issue handling: support staff and operators have to know which module to visit and which route to open rather than working from a single operational map.

The objective of this change is not to add new product logic. It is to make the admin layer reflect the real operating surface of the product and make the current module set discoverable, accessible, and actionable from one place.

## Goals / Non-Goals

**Goals:**
- Expose the full supported module set in the admin experience
- Use consistent navigation and summary states across modules
- Keep the issue-triage flow aligned with the current access model and role checks
- Make module and customer issue workflows reachable from a single admin entry point

**Non-Goals:**
- Rebuilding the product modules themselves
- Introducing new entitlement logic beyond the current role and feature checks
- Creating new backend capabilities without a direct admin workflow need

## Decisions

### 1. Treat admin as the product operations surface, not a legacy dashboard

**Decision:** The admin area becomes the canonical operations surface for the current active modules, with module summaries, issue paths, and direct links to deeper views.

**Rationale:**
- The admin area is the natural place for cross-module support and issue resolution.
- Operators should not need to remember each module route or discover hidden links.
- Consistent admin summaries reduce the risk of support workflows being missed.

### 2. Preserve existing authorization rules as the source of truth

**Decision:** Module visibility stays controlled by the same entitlement and authorization logic currently used by the app.

**Rationale:**
- This avoids widening access through admin-only shortcuts.
- It keeps the admin layer aligned with the actual product feature gates.

### 3. Focus on visibility and triage first, then deeper actions

**Decision:** The first admin delivery focuses on discovery, status, and issue entry points; direct edits remain routed through the module or customer-specific flows.

**Rationale:**
- It fixes the biggest operational gap without overloading the admin layer with module-level editing logic.
- It keeps each module’s domain rules in its own place while making the admin view act as a navigation and triage layer.

## Architecture

- **Admin dashboard**: acts as the landing surface for the full module set and the issue summary.
- **Module summaries**: each supported module contributes a small operational status block showing current health and action state.
- **Direct links**: all summaries route to the relevant module page or support workflow without duplicating the underlying logic.
- **Access checks**: admin visibility is filtered through the current feature gates and role checks rather than a separate admin-only permission model.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Admin becomes denormalized and duplicates module data | Keep summaries lightweight and route-driven; do not duplicate core business logic |
| Access leakage via admin surface | Use existing role and entitlement checks as the only source of truth |
| Navigation grows too large | Group by operational theme and keep only current supported modules |

## Migration Plan

**Phase 1: Admin surface review**
- Inventory current supported modules and determine which are represented in admin today
- Remove stale or duplicate entry points

**Phase 2: Consolidated landing surface**
- Add module summaries and navigation to the admin dashboard
- Keep labels, grouping, and access gating consistent with the product

**Phase 3: Issue workflow wiring**
- Connect each summary to the correct operational workflow or support path
- Verify that issue resolution and escalation remain traceable

**Phase 4: Validation**
- Confirm the admin dashboard reflects the full supported module set
- Confirm hidden modules remain hidden and all accessible modules can be reached
