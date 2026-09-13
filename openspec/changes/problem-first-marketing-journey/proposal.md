## Why

Visitors encounter too much product architecture before understanding the business problem PaidSoon solves, which creates cognitive overload and weakens conversion intent. We need a clearer narrative sequence that starts with the problem and desired outcome, then progressively reveals platform depth in a way that supports private-beta trust and a consistent early-access call to action.

## What Changes

- Reframe the homepage information architecture to follow a problem-first narrative: problem, outcome, how it works, relevant modules, proof, pricing, and CTA.
- Simplify the hero to one primary promise, one supporting statement, and a consistent CTA pair focused on early access and product explanation.
- Introduce an early comparison section that explains how PaidSoon complements accounting tools by shifting from historical recording to next-action decision support.
- Promote a four-part control cycle (get paid, stop waste, protect margins, plan ahead) as the primary explanatory model.
- Move and regroup the nine-module presentation into lower-page grouped categories with unequal emphasis and clearer buyer questions.
- Standardize private-beta availability language and CTA labels across homepage, platform, modules, pricing, and footer paths.
- Add a pricing pre-selector that asks which financial control problem a visitor wants to solve first, then recommends a suitable plan tier.
- Align top-level marketing navigation and solution taxonomy with outcome-based language.

## Capabilities

### New Capabilities
- `marketing/problem-first-journey`: Defines the canonical marketing page journey, section order, CTA intensity progression, and outcome-first content model across homepage, platform overview, and module landing pages.

### Modified Capabilities
- `landing-how-it-works-plan-gating`: Updates hero/above-the-fold messaging, CTA labels, and section ordering so the homepage introduces value before full architecture details.
- `marketing-module-portfolio-pages`: Repositions module-level messaging around business problems and actions, with supporting capabilities treated as secondary where appropriate.
- `marketing-feature-claim-accuracy`: Clarifies private-beta and availability assertions so “available now” language is replaced with explicit early-access states.
- `subscription-plan-tiers`: Refines pricing-page positioning with a problem-first selector and clearer tier framing while preserving existing productized billing constraints.

## Impact

- Affected routes and components in `app/(marketing)/` and `components/marketing/`, `components/pricing/`, and related shared presentation utilities.
- Updates to marketing copy variants, CTA constants, and plan-selection presentation logic (without changing Stripe billing mechanics).
- Documentation/spec alignment for private-beta status language and marketing navigation taxonomy.
- Potential analytics funnel changes for hero CTA, “how it works” click-through, and pricing plan recommendation interactions.