## Context

The marketing site uses two patterns for incomplete content. Eight pages import and render a `<PlaceholderPage>` component that unconditionally shows an amber "Coming soon — this page is a placeholder" banner. Five legal/policy pages have an existing HTML skeleton but individual `<p>[PLACEHOLDER — …]</p>` blocks inside named sections, plus a "not legally binding" disclaimer in the page header.

Additionally, several fully-built pages contain specific strings that need updating: `app/layout.tsx` (beta banner text), `integrations/page.tsx` (integration names and statuses), `accountants/page.tsx` (TBA wording), `contact/page.tsx` (demo CTA label), `MarketingNav.tsx` (CTA button), and the homepage (hero CTA).

The `PlaceholderPage` component in `components/marketing/PlaceholderPage.tsx` will have zero usages after this change and can be deleted.

No database, API, auth, billing, or email systems are involved.

## Goals / Non-Goals

**Goals:**
- Every public marketing route renders real prose — no amber banner, no `[PLACEHOLDER]` strings, no "TBA"
- Legal pages are marked "Draft — pending legal review" but contain substantive draft policy text
- Private-beta messaging is consistent: banner, nav CTA, and homepage hero all say the same thing
- Australian spelling throughout; ABN `12 657 226 125` used where needed
- `PlaceholderPage` component is removed once unused

**Non-Goals:**
- Pricing page corrections (homepage pricing preview discrepancy with actual plans is out of scope)
- Actual legal review — pages are clearly marked as drafts
- Adding new routes or navigation items
- Changing auth gate logic in `middleware.ts` or `lib/liveMode.ts`
- Adding analytics, A/B testing, or CMS integration
- Translating content

## Decisions

### D1 — Replace PlaceholderPage pages with standalone full-content pages

Each of the 8 `PlaceholderPage` pages will be rewritten as a self-contained page with its own layout (consistent with the existing rich pages like `features/page.tsx` and `how-it-works/page.tsx`). The `PlaceholderPage` component import is removed from each file. No shared wrapper component is introduced.

**Alternative considered:** Enhance `PlaceholderPage` to accept a `content` prop and render full content when provided. Rejected — it conflates two concerns and the amber banner logic would still need to be removed. Cleaner to replace outright.

### D2 — Legal pages: replace `[PLACEHOLDER]` blocks, keep existing page skeleton

The 5 legal pages (`privacy`, `terms`, `cookies`, `security`, `acceptable-use`) already have well-structured HTML with named `<section>` blocks and headings. Only the `<p>[PLACEHOLDER …]</p>` elements and the "not legally binding" header disclaimer will be replaced. The outer structure, styling classes, and non-placeholder sections are preserved.

**Alternative considered:** Full rewrite of legal pages. Rejected — existing structure is sound; surgical replacement reduces diff size and risk of introducing layout regressions.

### D3 — Beta CTA: change "Start Free Trial" to "Request early access" with `/contact` link

`MarketingNav.tsx` (both desktop and mobile) and the homepage hero will change the primary CTA from "Start Free Trial" → `"/pricing"` to "Request early access" → `"/contact"`. This is the correct call-to-action while `LIVE=false` and public sign-up is closed.

The pricing page's own "Get Started" / sign-up links are **not changed** — visitors who navigate there intentionally can still attempt the flow and will be gated by middleware if sign-up is disabled.

**Alternative considered:** Conditional rendering based on a `NEXT_PUBLIC_LIVE` env var. Rejected — adds complexity for a known temporary state. The revert at launch is a one-line change per occurrence.

### D4 — ABN: hardcode fallback in `MarketingFooter.tsx`

The footer currently renders `"ABN: [PLACEHOLDER — configure NEXT_PUBLIC_COMPANY_ABN]"` when the env var is missing. The fallback will be hardcoded to `"ABN: 12 657 226 125"`. The env var remains supported as an override.

**Rationale:** ABN is not a secret; it is a public business identifier required on all commercial Australian websites. Requiring an env var to avoid a broken fallback is unnecessary operational overhead.

### D5 — Delete `PlaceholderPage` component after last usage is removed

Once all 8 importing pages are rewritten, `components/marketing/PlaceholderPage.tsx` will be deleted. It serves no other purpose.

## Risks / Trade-offs

- **Legal disclaimer risk** → Mitigation: All legal pages retain "Draft — pending legal review" heading. No claim is made that content is final or legally approved.
- **CTA revert at launch** → Mitigation: All beta CTA changes are clearly labelled in tasks; a separate task tracks the revert point.
- **Content accuracy** → Mitigation: All page content matches the confirmed product description (Stripe Connect live; MYOB/Xero/QuickBooks planned; Syspac Pty Ltd; ABN 12 657 226 125). No invented features or pricing are introduced.
- **Build regression from PlaceholderPage deletion** → Mitigation: The component is only deleted after all import sites are removed. TypeScript will catch any missed usages at build time.
