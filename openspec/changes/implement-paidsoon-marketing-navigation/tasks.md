## 1. Shared Marketing Layout and Components

- [x] 1.1 Create `components/marketing/MarketingNav.tsx` as a Server Component with mobile-menu sub-component (`MobileNav` as `"use client"`) — includes PaidSoon wordmark, all primary nav links, Log In, and Start Free Trial CTA
- [x] 1.2 Create `components/marketing/MarketingFooter.tsx` as a Server Component with five link groups: Company, Product, Resources, Legal, Trust — reads `NEXT_PUBLIC_COMPANY_ABN` with fallback placeholder
- [x] 1.3 Create `app/(marketing)/layout.tsx` that wraps children with `<MarketingNav>` and `<MarketingFooter>`
- [x] 1.4 Add `NEXT_PUBLIC_COMPANY_ABN` to `.env.local.example` and document it in `docs/runbooks/README.md`

## 2. Migrate Existing Pages into Marketing Layout Group

- [x] 2.1 Move `app/page.tsx` to `app/(marketing)/page.tsx` (delete original after confirming the new path builds)
- [x] 2.2 Move `app/pricing/page.tsx` to `app/(marketing)/pricing/page.tsx` (delete original after confirming the new path builds)
- [x] 2.3 Remove the inline `<nav>` from the migrated homepage (now provided by the shared layout)
- [x] 2.4 Remove the inline `<nav>` from the migrated pricing page (now provided by the shared layout)
- [x] 2.5 Update the migrated homepage to add all required sections: problem, solution, how-it-works preview, feature highlights, integrations, trust, FAQ preview, final CTA
- [x] 2.6 Update the migrated pricing page with revised plan tiers: Starter (A$19/mo), Business (A$49/mo), Accountant Partner (Contact us); add feature comparison table and trial/no-lock-in messaging
- [x] 2.7 Add `generateMetadata` exports to both the homepage and pricing page

## 3. Contact Page and API Placeholder

- [x] 3.1 Create `app/(marketing)/contact/page.tsx` with a `"use client"` contact form component supporting enquiry types: Sales, Support, Accountant Partnership; include demo request CTA
- [x] 3.2 Create `components/marketing/ContactForm.tsx` as a `"use client"` component that calls `/api/contact` and shows an inline fallback message if the API returns a non-success response
- [x] 3.3 Create `app/api/contact/route.ts` that returns `501 Not Implemented` with `{ "error": "Contact form not yet implemented" }` — documented with a `// TODO: implement` comment
- [x] 3.4 Add `generateMetadata` export to the contact page

## 4. Core Marketing Pages

- [x] 4.1 Create `app/(marketing)/features/page.tsx` with sections for all ten feature categories; add a pricing CTA; add `generateMetadata`
- [x] 4.2 Create `app/(marketing)/how-it-works/page.tsx` with six numbered workflow steps; add pricing CTA; add `generateMetadata`
- [x] 4.3 Create `app/(marketing)/accountants/page.tsx` with multi-client, debtor visibility, and partner sections; add partnership CTA linking to `/contact`; add `generateMetadata`
- [x] 4.4 Create `app/(marketing)/resources/page.tsx` as a hub linking to blog, help, docs, FAQ, release notes with descriptions; add `generateMetadata`
- [x] 4.5 Create `app/(marketing)/integrations/page.tsx` with cards for Stripe Connect (available), MYOB, Xero, QuickBooks (coming soon); add integration request CTA; add `generateMetadata`

## 5. Placeholder Content Pages

- [x] 5.1 Create `components/marketing/PlaceholderPage.tsx` — a reusable Server Component that accepts `title` and `description` props and renders a placeholder notice banner
- [x] 5.2 Create `app/(marketing)/about/page.tsx` using `PlaceholderPage`; add `generateMetadata`
- [x] 5.3 Create `app/(marketing)/careers/page.tsx` using `PlaceholderPage`; add `generateMetadata`
- [x] 5.4 Create `app/(marketing)/roadmap/page.tsx` using `PlaceholderPage`; add `generateMetadata`
- [x] 5.5 Create `app/(marketing)/blog/page.tsx` using `PlaceholderPage` with a `<!-- TODO: replace with CMS integration -->` comment; add `generateMetadata`
- [x] 5.6 Create `app/(marketing)/help/page.tsx` using `PlaceholderPage`; add `generateMetadata`
- [x] 5.7 Create `app/(marketing)/docs/page.tsx` using `PlaceholderPage` with a `<!-- TODO: replace with docs platform integration -->` comment; add `generateMetadata`
- [x] 5.8 Create `app/(marketing)/faq/page.tsx` using `PlaceholderPage` with FAQ section stubs; add `generateMetadata`
- [x] 5.9 Create `app/(marketing)/release-notes/page.tsx` using `PlaceholderPage`; add `generateMetadata`

## 6. Legal Pages

- [x] 6.1 Create `app/(marketing)/privacy/page.tsx` with legal-review disclaimer banner, section stubs (Data Collection, User Rights, Contact), and Syspac Pty Ltd reference; add `generateMetadata`
- [x] 6.2 Create `app/(marketing)/terms/page.tsx` with legal-review disclaimer banner and service terms section stubs; add `generateMetadata`
- [x] 6.3 Create `app/(marketing)/cookies/page.tsx` with legal-review disclaimer banner and cookie usage section stubs; add `generateMetadata`
- [x] 6.4 Create `app/(marketing)/security/page.tsx` with security practices overview and legal-review disclaimer; add `generateMetadata`
- [x] 6.5 Create `app/(marketing)/acceptable-use/page.tsx` with acceptable use policy section stubs and legal-review disclaimer; add `generateMetadata`

## 7. Verification

- [x] 7.1 Run `next build` locally and confirm zero route conflicts, zero TypeScript errors, and zero missing module errors
- [ ] 7.2 Confirm all 21 marketing routes return HTTP 200 in both `LIVE=true` and `LIVE=false` modes (test at least homepage, `/features`, `/pricing`, `/contact`, `/privacy`)
- [ ] 7.3 Confirm the `MarketingNav` renders on all marketing pages and the inline nav is removed from all migrated pages
- [ ] 7.4 Confirm the `MarketingFooter` appears on all marketing pages with correct link groups
- [ ] 7.5 Confirm `NEXT_PUBLIC_COMPANY_ABN` placeholder renders in the footer when the env var is absent
- [x] 7.6 Confirm the contact form displays a fallback message when the API returns 501
- [x] 7.7 Confirm `/integrations` labels Stripe Connect as available and MYOB/Xero/QuickBooks as "Coming soon"
- [x] 7.8 Confirm all legal pages display a legal-review disclaimer banner
- [x] 7.9 Run `npm run test` and confirm no regressions in existing test suite
- [ ] 7.10 Manually verify mobile nav hamburger toggle opens/closes with keyboard (Enter/Space) and that `aria-expanded` updates correctly
