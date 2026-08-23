## Why

The Settings → Team invite workflow currently appears to work but returns a success response without storing an invitation or sending any message. This creates a false sense of completion for the person invoking it and creates confusion for operators and admins. In customer-facing product flows, fake-success behavior is worse than a hard failure because it misleads the user while not performing the expected action.

## What Changes

- Make the team-invite endpoint deterministic and truthful: either persist the invite and send it or reject the action as unavailable.
- If the feature is intentionally not implemented, return a feature-unavailable response and disable the action in the UI until it is fully implemented.
- If the feature is implemented later, ensure the API contract and UI contract match the actual persistence and notification behavior.
- Add tests asserting that success is only returned when a real invite is created.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `team-seats-invite-flow`: make the workflow either operational or explicitly unavailable.
- `feature-gating-policy`: ensure the app cannot claim an action succeeded when the backend does not do the work.

## Impact

- Affected code:
  - `app/api/settings/team/invite/route.ts`
  - related team settings UI components and tests
- Affected systems:
  - user experience, admin trust, product operations
- No schema migration required unless the real implementation adds invite persistence.
- This is a release correctness and customer trust fix.

## Release Criteria

- The invite endpoint never reports success without a persisted invite or safe feature-unavailable result.
- Team settings UI matches the API behavior.
- Tests cover both the unavailable state and the implemented state.
