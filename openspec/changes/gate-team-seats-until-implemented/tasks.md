## 1. Team Surface Gating

- [x] 1.1 Update Team settings page loading logic to derive `team_seats` implementation state and pass non-actionable state to the client when unimplemented.
- [x] 1.2 Keep Team tab visible in settings navigation, but ensure Team page renders explicit coming-soon/read-only messaging while unimplemented.
- [x] 1.3 Remove or disable invite submission controls in `TeamInvitesClient` when `team_seats` is unimplemented, while preserving seat-limit context display.

## 2. Team Invite API Contract

- [x] 2.1 Update `GET /api/settings/team/invite` response shape to include feature availability state required by the Team UI.
- [x] 2.2 Update `POST /api/settings/team/invite` to return a deterministic non-2xx feature-unavailable response with a stable machine-readable reason code while `team_seats` is unimplemented.
- [x] 2.3 Update client-side error handling to map the unavailable reason code to consistent coming-soon messaging.

## 3. Verification and Regression Coverage

- [x] 3.1 Add or update tests for Team settings rendering to verify non-actionable behavior when `team_seats` is unimplemented.
- [x] 3.2 Add or update API tests for Team invite POST to assert non-success unavailable semantics and stable reason code under unimplemented state.
- [x] 3.3 Run lint, typecheck, and test suites covering touched Team settings and API files.

## 4. Documentation and OpenSpec Consistency

- [x] 4.1 Confirm `openspec validate --change gate-team-seats-until-implemented --strict` passes with proposal, spec deltas, design, and tasks.
- [x] 4.2 Update any affected product-facing copy/docs to preserve “planned/not implemented” language consistency for Team seats.
