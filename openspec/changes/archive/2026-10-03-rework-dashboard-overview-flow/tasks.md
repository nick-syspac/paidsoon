## 1. Review current dashboard structure and constraints

- [x] Confirm the current dashboard shell and summary composition in `app/dashboard/page.tsx`, `components/dashboard/DashboardNavRail.tsx`, and any related access-gating helpers
- [x] Verify the overview page already contains the required content blocks and does not need new domain logic to support the redesign
- [x] Confirm feature- and entitlement-based visibility checks remain the source of truth for module access

## 2. Define the new hierarchy for the overview

- [x] Segment the dashboard overview into clear blocks: attention, cash posture, digest, and module links
- [x] Reuse the existing summary cards and module data without changing their underlying computation rules
- [x] Ensure the top of the overview focuses on urgent action before background context or deeper analysis

## 3. Reorder the sidebar to match the operating flow

- [x] Update the dashboard rail ordering to reflect product flow rather than historical implementation order
- [x] Keep conditional visibility logic for module access intact for DepositGuard, Owner’s Digest, CommitGuard, MarginGuard, RunwayGuard, Tax Buffer, and SpendLeak
- [x] Verify the ordering remains readable and stable across the supported dashboard pages

## 4. Preserve access and route compatibility

- [x] Confirm no route changes are required for the overview redesign
- [x] Preserve all existing module routes and access checks while changing the information hierarchy only
- [x] Ensure quick links continue to route to the correct pages after the reordering

## 5. Validate the redesigned flow

- [x] Open the dashboard and confirm the order of sections reads clearly from urgent signal to strategic summary to module drill-down
- [x] Check the dashboard sidebar order against the intended flow and verify it matches the overview narrative
- [x] Validate that no unsupported or hidden modules appear for users without entitlements

## 6. Final QA and sign-off

- [x] Review the final structure for clarity, accessibility, and consistency with the current app shell
- [x] Verify there are no unintended changes to business logic, API contracts, or schema definitions
- [x] Confirm the change is ready for implementation review and that the proposal, design, and tasks are aligned
