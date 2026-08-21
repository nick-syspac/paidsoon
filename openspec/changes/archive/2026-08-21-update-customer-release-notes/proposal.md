## Why

Customer-facing release communication exists in
`docs/release-notes/customer-release-notes.md`, but updates are manual and can drift
from what was actually shipped. This creates support risk and weakens trust when
customers cannot clearly see what changed, when it changed, and whether any action
is needed.

We need a repeatable release-note update process that keeps customer notes current,
accurate, and consistently formatted at every release.

## What Changes

- Update customer-facing release notes in `docs/release-notes/customer-release-notes.md`
  with a new top entry for the next release.
- Standardize the entry to the existing template sections: Summary, New,
  Improved, Fixed, Security and Reliability, Known Limitations, Rollout Notes.
- Add release-note authoring guidance so each entry is:
  customer-readable, non-sensitive, and aligned with shipped behavior.
- Align internal and customer release note references by ensuring the internal
  release ID appears in both files for traceability.

## Capabilities

### New Capabilities
- `customer-release-notes-maintenance`: a consistent process and structure for
  customer-facing release updates in `docs/release-notes/customer-release-notes.md`.

### Modified Capabilities
- (none)

## Impact

- **Affected files**:
  - `docs/release-notes/customer-release-notes.md`
  - `docs/release-notes/internal-release-notes.md` (reference consistency only)
  - Optional process note in `docs/runbooks/README.md` if release workflow
    guidance is expanded.
- **No schema, RLS, billing, or API contract changes.**
- **Operational effect**: lowers release communication ambiguity and support
  escalation due to unclear customer messaging.