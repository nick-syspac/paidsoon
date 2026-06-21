## Why

The landing page "How it works" section currently only explains reminder timing and does not communicate key product differentiators like templates and AI support. Prospects cannot quickly see which capabilities are included by plan tier, so higher-tier value is under-explained at the point of conversion.

## What Changes

- Expand the homepage "How it works" section to include reminder templates and AI integration as explicit workflow steps.
- Add visible plan-tier cues for advanced items in the section using a small asterisk marker.
- Add explanatory microcopy for the asterisk so visitors understand marked items are available on higher plans.
- Keep existing core reminder-sequence messaging while improving feature clarity and upgrade signaling.

## Capabilities

### New Capabilities
- `landing-how-it-works-plan-gating`: Define homepage "How it works" content requirements that include templates, AI integration, and asterisk-marked higher-plan features with explanatory copy.

### Modified Capabilities
- None.

## Impact

- Affected code: homepage content/layout in `app/page.tsx`.
- UX/content impact: clearer product narrative and plan-tier communication before pricing selection.
- No backend/API/database changes expected.
- Potentially affected tests: UI/content assertions if homepage copy snapshots or text matchers are added/updated.
