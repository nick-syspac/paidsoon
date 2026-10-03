## 1. Guide Scope and Governance Decisions

- [x] 1.1 Confirm and document the canonical owner metadata field name for help MDX pages (for example `owner`) in this change.
- [x] 1.2 Confirm and document the freshness policy for `lastVerified` (for example 30/60/90 day review window).
- [x] 1.3 Produce a user-guide coverage map that lists required sections and target pages: onboarding, billing/subscription, invoice workflows, integrations, and account/settings.

## 2. Spec and Content Structure Updates

- [x] 2.1 Validate that `openspec/changes/build-paidsoon-user-guide/specs/help-center/spec.md` covers all new requirements and scenarios for guide structure, shipped-capability mapping, and verification metadata.
- [x] 2.2 Add or revise help center MDX pages in `content/help/` to match the coverage map and standard tutorial template.
- [x] 2.3 Ensure each user-guide page includes required metadata (`lastVerified` and confirmed owner field) and accurate plan-gating notes where applicable.

## 3. Discoverability and Accuracy Verification

- [x] 3.1 Update help navigation metadata so all guide sections are discoverable in `/help`.
- [x] 3.2 Verify help search returns the new/updated user guide pages and remains scoped to help content only.
- [x] 3.3 Run a capability-accuracy pass against implemented behavior (including `UNIMPLEMENTED_FEATURES` and plan feature gates) and correct any overstated claims.

## 4. Validation and Handoff

- [x] 4.1 Run `openspec validate build-paidsoon-user-guide --type change --strict` and fix any validation findings.
- [x] 4.2 Perform editorial review for clarity and consistent template conformance across all new/updated pages.
- [x] 4.3 Prepare rollout notes summarizing new guide pages, ownership, and the ongoing verification cadence.
