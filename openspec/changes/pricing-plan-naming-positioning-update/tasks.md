## 1. Catalog and messaging

- [ ] 1.1 Update the canonical plan catalog so the public label for the `solo` tier is `Business Control` while preserving the internal `solo` identifier.
- [ ] 1.2 Refresh plan positioning copy to match the required Essentials, Business Control, Small Business, and Business Pro story.
- [ ] 1.3 Confirm pricing order and Small Business popularity badge remain aligned with the catalog.

## 2. Pricing and onboarding surfaces

- [ ] 2.1 Update pricing page metadata, plan cards, and comparison copy to use the renamed public label and required wording.
- [ ] 2.2 Update onboarding and plan-selection flows to surface `Business Control` without changing the underlying tier ID.
- [ ] 2.3 Update account, dashboard, and settings surfaces that announce the current plan title or upgrade prompts.

## 3. Validation and compatibility

- [ ] 3.1 Update tests to assert `solo` remains stable internally while rendering `Business Control` to customers.
- [ ] 3.2 Verify no customer-facing pricing or settings surface still shows `Solo` and confirm the price remains A$29/month.
- [ ] 3.3 Run the relevant test, lint, type-check, and build verification commands and record the results.
