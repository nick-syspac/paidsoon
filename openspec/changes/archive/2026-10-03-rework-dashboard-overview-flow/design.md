## Context

The current dashboard shell is composed around a left-rail navigation and a content panel. The overview page in `app/dashboard/page.tsx` already generates several modules of data, but these are layered without a clear decision sequence. The navigation rail in `components/dashboard/DashboardNavRail.tsx` also reflects an incremental implementation order rather than a product-first flow.

See proposal.md for the motivation and user-facing intent behind the redesign.

## Goals / Non-Goals

**Goals:**
- Reorder the dashboard overview so urgent operational signals appear before background context
- Keep the existing data sources, module pages, and route structure intact
- Make the dashboard navigation read like a product flow rather than a historical list of modules
- Preserve entitlement-based visibility for modules and route access

**Non-Goals:**
- Rewriting module logic, data model structures, or analytics rules
- Introducing new product capabilities or new module routes
- Replacing proven permission checks or reworking subscription logic

## Decisions

### 1. Keep the same data sources and content blocks, but restructure their presentation order
The design does not change the calculations in `lib/dashboard/overviewCards.ts` or the summary data loaded in `app/dashboard/page.tsx`. Instead, the layout is reorganised into a hierarchy: attention, cash posture, digest, quick links.

**Why:** This keeps the change low-risk and focused on presentation. The logic already exists and is already being computed; the user problem is context and ordering, not missing information.

**Alternatives considered:** Rewriting the data model or adding new summary APIs would increase risk and scope without addressing the core usability issue.

### 2. Use a clear triage-first overview sequence
The overview will render the attention block first, then cash posture, then digest and module summaries, and only then deeper navigation actions. This is intended to match how an owner makes decisions: identify what needs action, confirm financial posture, review the summary, then drill into specific modules.

**Why:** The page is already acting as a command centre; this design makes it behave like a triage screen without removing the depth that already exists.

**Alternatives considered:** Keeping a flat list of equal-weight sections would continue the current confusion and would not clearly prioritise action items.

### 3. Reorder the sidebar to reflect product flow rather than historical implementation order
The dashboard sidebar needs a stable ordering that reads as a narrative, not a registry of modules. The design uses primary operations first, then digest and risk modules, then deeper financial-analysis tools.

**Why:** This improves discoverability and reduces cognitive load without changing access rules or routes.

**Alternatives considered:** Leave the sidebar in insertion order or continue grouping by whichever module was implemented most recently. That preserves technical history but not product clarity.

### 4. Preserve access-control logic and route compatibility
The design will continue to use the existing entitlement checks and route structure. It does not alter module access definitions or create hidden routes.

**Why:** The repo already has a policy for access gating and route behaviour; the overview redesign should not become a second source of truth for product permissions.

**Alternatives considered:** Creating a parallel settings-like or nav-only permission layer would duplicate policy and create maintenance risk.

## Risks / Trade-offs

- [Information overload vs. compactness] → Keep the overview hierarchy clear, but do not remove useful summary data; the design compresses context rather than hiding it.
- [Change scope vs. product clarity] → The redesign intentionally avoids new functionality. It improves the hierarchy and ordering but does not broaden the product surface.
- [Historical order vs. product narrative] → Reordering the sidebar may feel unfamiliar to internal users who memorised the old sequence, but it improves discoverability for genuine product flow.
- [Triage-first design vs. breadth of data] → Some users may want to see all modules immediately; the design resolves this by keeping deep links present but secondary to the action flow.

## Migration Plan

1. Reorder the dashboard sidebar entries in the canonical nav array while preserving entitlement checks.
2. Rework the overview page sections into blocks ordered by urgency: attention, cash posture, digest, then module links.
3. Keep the existing route handlers, module pages, and underlying data-fetch logic unchanged.
4. Verify that the overview still renders with the same modules and the same access conditions when the user is logged in with different feature sets.
5. Validate that the updated hierarchy reads clearly and that no route or logical behaviour has been changed.

## Open Questions

No blocking open questions remain. The design is bounded to ordering, structure, and presentation and intentionally excludes broader product changes.
