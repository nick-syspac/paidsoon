## 1. Settings API and validation

- [x] 1.1 Define the Cost Guard settings request schema and supported ranges
- [x] 1.2 Add an authenticated settings API route for updating user-scoped Cost Guard settings
- [x] 1.3 Use `withUserContext` to persist the settings row safely and create it on first save
- [x] 1.4 Return clear validation and error responses for invalid values

## 2. Settings page behavior

- [x] 2.1 Replace the read-only cards with editable controls for sensitivity, materiality, lookback, and digest frequency
- [x] 2.2 Wire the page to the settings API with save and cancel behavior
- [x] 2.3 Preserve the default values in the form when no record exists yet
- [x] 2.4 Show success/error feedback consistent with the rest of the settings area

## 3. Verification

- [x] 3.1 Add focused tests for valid updates and invalid payload rejection
- [x] 3.2 Run the relevant test command and confirm the settings behavior passes
- [x] 3.3 Confirm the change remains aligned with the existing RLS and settings patterns
