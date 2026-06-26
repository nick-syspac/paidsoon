## ADDED Requirements

### Requirement: Marketing navigation header SHALL render on all public marketing pages
The system SHALL render a `MarketingNav` component in the shared `app/(marketing)/layout.tsx` that appears at the top of every public marketing page. The nav SHALL contain the PaidSoon wordmark (linking to `/`), primary navigation links, a `Log In` link, and a `Start Free Trial` CTA button.

#### Scenario: Nav renders on homepage
- **WHEN** a visitor loads `/`
- **THEN** the `MarketingNav` header is visible with the PaidSoon wordmark, all primary navigation links, `Log In`, and `Start Free Trial`

#### Scenario: Nav renders on all marketing pages
- **WHEN** a visitor loads any route under `app/(marketing)/`
- **THEN** the same `MarketingNav` header is visible without requiring it to be declared in the individual page component

### Requirement: Top navigation SHALL include required primary links
The `MarketingNav` SHALL include links to: Home (`/`), Features (`/features`), Pricing (`/pricing`), How It Works (`/how-it-works`), For Accountants (`/accountants`), Resources (`/resources`), Contact (`/contact`).

#### Scenario: All primary nav links are present and routable
- **WHEN** a visitor views the nav
- **THEN** links for Home, Features, Pricing, How It Works, For Accountants, Resources, and Contact are all present
- **THEN** each link routes to its correct path without a 404 response

#### Scenario: Log In link routes to sign-in page
- **WHEN** a visitor clicks `Log In` in the nav
- **THEN** they are routed to `/sign-in`

### Requirement: Start Free Trial CTA SHALL be visually distinct and route to /pricing
The `Start Free Trial` button in the nav SHALL be styled as the primary call-to-action (filled/contrasting background) and SHALL route to `/pricing`.

#### Scenario: Start Free Trial is visually prominent
- **WHEN** a visitor views the nav
- **THEN** the `Start Free Trial` button has a distinct filled background that differentiates it from plain text nav links

#### Scenario: Start Free Trial routes to pricing
- **WHEN** a visitor clicks `Start Free Trial`
- **THEN** they are routed to `/pricing`

### Requirement: Navigation SHALL be responsive on mobile and desktop
The `MarketingNav` SHALL render a horizontal link list on screens ≥768px wide and a hamburger/toggle menu on screens <768px. The mobile menu SHALL be keyboard accessible.

#### Scenario: Desktop layout shows full nav
- **WHEN** the viewport is ≥768px wide
- **THEN** all nav links are visible in a horizontal row

#### Scenario: Mobile layout shows hamburger menu
- **WHEN** the viewport is <768px wide
- **THEN** a toggle button is visible and the full nav links are hidden until activated

#### Scenario: Mobile menu toggle is keyboard accessible
- **WHEN** a keyboard user focuses the hamburger button and presses Enter or Space
- **THEN** the mobile menu opens or closes
- **THEN** `aria-expanded` on the button reflects the current state

### Requirement: Marketing footer SHALL render on all public marketing pages
The system SHALL render a `MarketingFooter` component in `app/(marketing)/layout.tsx` that appears at the bottom of every public marketing page.

#### Scenario: Footer renders on homepage
- **WHEN** a visitor loads `/`
- **THEN** the `MarketingFooter` is visible below all page content

### Requirement: Footer SHALL contain five link groups
The `MarketingFooter` SHALL contain five named groups: Company, Product, Resources, Legal, and Trust.

#### Scenario: Company group links are present
- **WHEN** a visitor views the footer
- **THEN** the Company group contains links to About (`/about`), Contact (`/contact`), and Careers (`/careers`)

#### Scenario: Product group links are present
- **WHEN** a visitor views the footer
- **THEN** the Product group contains links to Features (`/features`), Pricing (`/pricing`), Integrations (`/integrations`), and Roadmap (`/roadmap`)

#### Scenario: Resources group links are present
- **WHEN** a visitor views the footer
- **THEN** the Resources group contains links to Blog (`/blog`), Help Centre (`/help`), Documentation (`/docs`), FAQ (`/faq`), and Release Notes (`/release-notes`)

#### Scenario: Legal group links are present
- **WHEN** a visitor views the footer
- **THEN** the Legal group contains links to Privacy Policy (`/privacy`), Terms of Service (`/terms`), Cookie Policy (`/cookies`), Security (`/security`), and Acceptable Use Policy (`/acceptable-use`)

#### Scenario: Trust group content is present
- **WHEN** a visitor views the footer
- **THEN** the Trust group displays "Syspac Pty Ltd", the ABN (from `NEXT_PUBLIC_COMPANY_ABN` or placeholder), "Australian owned and operated", a copyright notice, and a LinkedIn link placeholder

### Requirement: Footer ABN SHALL be configurable via environment variable
The footer Trust section SHALL read the ABN from `NEXT_PUBLIC_COMPANY_ABN`. If the variable is not set, a visible placeholder string SHALL be displayed.

#### Scenario: ABN set via env var
- **WHEN** `NEXT_PUBLIC_COMPANY_ABN` is set to "12 345 678 901"
- **THEN** the footer displays "ABN: 12 345 678 901"

#### Scenario: ABN env var absent
- **WHEN** `NEXT_PUBLIC_COMPANY_ABN` is not set
- **THEN** the footer displays a placeholder string indicating the ABN must be configured

### Requirement: Navigation SHALL meet keyboard accessibility requirements
All interactive nav elements SHALL be reachable and activatable via keyboard. Focus states SHALL be visible. ARIA attributes SHALL correctly reflect interactive states.

#### Scenario: All nav links reachable via Tab
- **WHEN** a keyboard user tabs through the page
- **THEN** all nav links and the CTA button receive focus in logical order

#### Scenario: Focus is visible on nav elements
- **WHEN** a nav element receives keyboard focus
- **THEN** a visible focus ring or outline is displayed
