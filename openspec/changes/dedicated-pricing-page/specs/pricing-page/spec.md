## ADDED Requirements

### Requirement: Pricing page is publicly accessible
The system SHALL serve a `/pricing` page that is publicly accessible without authentication, in both live and non-live (`LIVE=false`) mode.

#### Scenario: Unauthenticated visitor accesses /pricing
- **WHEN** an unauthenticated visitor navigates to `/pricing`
- **THEN** the page renders with all three plan cards (Starter, Solo, Small Business) and their CTAs

#### Scenario: /pricing is not blocked by the live-mode gate
- **WHEN** `LIVE=false` and a visitor navigates to `/pricing`
- **THEN** the page renders normally (not redirected to `/`)

### Requirement: Pricing page displays all subscription tiers
The system SHALL display all three subscription tiers on `/pricing` with name, monthly price (A$), description, feature list, and a CTA button per plan.

#### Scenario: All three plan cards are visible
- **WHEN** a visitor loads `/pricing`
- **THEN** Starter (A$9/mo), Solo (A$19/mo), and Small Business (A$39/mo) cards are all displayed

#### Scenario: Solo plan is visually distinguished as recommended
- **WHEN** a visitor loads `/pricing`
- **THEN** the Solo plan card is visually highlighted (e.g., border, badge) to indicate it is the most popular plan

### Requirement: Plan CTA stores selection and navigates to sign-up
The system SHALL, when a visitor clicks a plan CTA on `/pricing`, store the selected plan tier in `localStorage` under the key `preselectedPlan` and navigate to `/sign-up`.

#### Scenario: Visitor clicks a plan CTA
- **WHEN** a visitor clicks the CTA for any plan on `/pricing`
- **THEN** `localStorage.setItem("preselectedPlan", "<tier-id>")` is called with the correct tier ID (`"starter"`, `"solo"`, or `"small_business"`) before navigation to `/sign-up`

### Requirement: Onboarding plan picker reads preselected plan from localStorage
The system SHALL, when `OnboardingPlanPicker` mounts, read `preselectedPlan` from `localStorage`, use it as the initial selected tier, and then remove it from `localStorage`.

#### Scenario: User completes sign-up after clicking Solo on /pricing
- **WHEN** `localStorage.getItem("preselectedPlan")` returns `"solo"` when `OnboardingPlanPicker` mounts
- **THEN** the Solo plan is pre-selected and `localStorage.removeItem("preselectedPlan")` is called

#### Scenario: No preselected plan in localStorage
- **WHEN** `localStorage.getItem("preselectedPlan")` returns `null` when `OnboardingPlanPicker` mounts
- **THEN** the Solo plan is selected by default (existing behaviour)

#### Scenario: Invalid value in preselectedPlan localStorage key
- **WHEN** `localStorage.getItem("preselectedPlan")` returns an unrecognised value
- **THEN** the Solo plan is selected by default

### Requirement: Landing page CTAs point to /pricing
The system SHALL update the "View plans" nav button and the "Start with Starter" hero CTA on the landing page to link to `/pricing` instead of `/sign-up`.

#### Scenario: Visitor clicks "View plans" in the nav
- **WHEN** a visitor clicks "View plans" in the landing page navigation
- **THEN** they are navigated to `/pricing`

#### Scenario: Visitor clicks "Start with Starter" hero CTA
- **WHEN** a visitor clicks the "Start with Starter" button in the hero section
- **THEN** they are navigated to `/pricing`

#### Scenario: Visitor clicks a plan CTA in the landing page #pricing section
- **WHEN** a visitor clicks any per-plan CTA button in the landing page `#pricing` section
- **THEN** they are navigated to `/pricing`
