## 1. MYOB Connection Lifecycle Hardening

- [x] 1.1 Update the MYOB callback flow so connection success distinguishes OAuth authorisation from first-sync readiness.
- [x] 1.2 Implement or complete company-file metadata resolution so each MYOB connection stores a stable identifier plus a support-friendly display name. — *Corrected by `fix-myob-company-file-identity`: the `getOrganisations()`/`select-org` approach this task originally shipped with never worked online (see that change's proposal for root cause); the callback now resolves `organisationId`/`organisationName` directly from the callback's `businessId`/`businessName`.*
- [x] 1.3 Ensure MYOB callback and sync paths produce deterministic pending, active, revoked, disconnected, and error outcomes without exposing tokens.

## 2. Status Visibility And Operator Support

- [x] 2.1 Extend user-facing integrations UI to show first-sync pending/error states and last sync outcome for MYOB connections.
- [x] 2.2 Extend admin-facing integrations and resync flows to surface the same MYOB readiness information needed for support triage.
- [x] 2.3 Add or update focused tests for MYOB connection status transitions, first-sync visibility, and support-safe metadata handling.

## 3. Runbooks And Environment Documentation

- [x] 3.1 Update the canonical environment-variable documentation and checked-in setup examples for all MYOB-related configuration, including validation guidance per environment.
- [x] 3.2 Update the go-live checklist/runbook with named MYOB launch gates, explicit pass/fail criteria, required evidence, and blocking rules.
- [x] 3.3 Align related documentation and rollout messaging so MYOB is not simultaneously presented as planned, beta-only, and production-ready.

## 4. Launch Validation

- [ ] 4.1 Execute a real MYOB sandbox validation covering connect, callback, first sync, invoice mapping, and sync status visibility.
- [ ] 4.2 Record the sandbox results against the documented MYOB gates and mark the rollout level as blocked, private beta, or supported production.
- [x] 4.3 Run the focused automated checks for the touched MYOB and documentation surfaces before closing the change.