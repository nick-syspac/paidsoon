## 1. Specification and contracts

- [x] 1.1 Finalize source-family enum and API payload schema for SpendLeak source selection (`bills`, `bank_transactions`, `suppliers`)
- [x] 1.2 Confirm default behavior for tenants without stored SpendLeak source settings remains equivalent to current all-sources expectation
- [x] 1.3 Validate capability deltas for SpendLeak dashboard and settings navigation

## 2. Persistence and API

- [x] 2.1 Add tenant-scoped SpendLeak settings persistence for selected source families
- [x] 2.2 Implement authenticated SpendLeak settings read/write endpoint(s) with Zod validation and non-empty source-selection constraint
- [x] 2.3 Ensure API responses expose resolved effective selection (stored value or default)

## 3. Settings UI

- [x] 3.1 Add SpendLeak settings route under dashboard settings
- [x] 3.2 Add SpendLeak settings navigation entry using existing feature/entitlement gating patterns
- [x] 3.3 Build source-selection form UX with clear copy that selection controls readiness expectations, not sync disablement

## 4. Dashboard status behavior

- [x] 4.1 Remove fixed completeness denominator from SpendLeak status composition
- [x] 4.2 Compute expected and synced counts from selected source families
- [x] 4.3 Update partial/initial messaging to reference selected source coverage

## 5. Testing and verification

- [x] 5.1 Update SpendLeak presentation tests for settings-aware completeness logic
- [x] 5.2 Update SpendLeak loader tests to include selected-source scenarios
- [x] 5.3 Add tests for SpendLeak settings API validation and default resolution behavior
- [x] 5.4 Update settings navigation tests to assert SpendLeak settings link availability for eligible users

## 6. Documentation and change hygiene

- [x] 6.1 Update relevant architecture/docs artifacts after implementation to reflect shipped behavior
- [x] 6.2 Run OpenSpec validation and resolve any schema/spec issues for this change
