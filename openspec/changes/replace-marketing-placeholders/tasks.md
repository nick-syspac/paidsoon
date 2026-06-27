## 1. Private-Beta Messaging (banner + nav + homepage CTA)

- [x] 1.1 Update `app/layout.tsx` beta banner text: replace "This site is not live yet. Sign in and sign up are currently disabled." with "PaidSoon is currently in private beta. Public sign-up is opening soon — contact us if you would like early access."
- [x] 1.2 Update `components/marketing/MarketingNav.tsx` desktop CTA: change label from "Start Free Trial" to "Request early access" and href from `/pricing` to `/contact`
- [x] 1.3 Update `components/marketing/MarketingNav.tsx` mobile CTA: same label and href change as 1.2
- [x] 1.4 Update `app/(marketing)/page.tsx` hero CTA: change label from "Start Free Trial" to "Request early access" and href from `/pricing` to `/contact`

## 2. PlaceholderPage Rewrites — Content Pages

- [x] 2.1 Rewrite `app/(marketing)/about/page.tsx`
- [x] 2.2 Rewrite `app/(marketing)/blog/page.tsx`
- [x] 2.3 Rewrite `app/(marketing)/careers/page.tsx`
- [x] 2.4 Rewrite `app/(marketing)/roadmap/page.tsx`
- [x] 2.5 Rewrite `app/(marketing)/help/page.tsx`
- [x] 2.6 Rewrite `app/(marketing)/docs/page.tsx`
- [x] 2.7 Rewrite `app/(marketing)/release-notes/page.tsx`
- [x] 2.8 Rewrite `app/(marketing)/faq/page.tsx`

## 3. Inline Placeholder Fills — Legal / Policy Pages

- [x] 3.1 Update `app/(marketing)/privacy/page.tsx`
- [x] 3.2 Update `app/(marketing)/terms/page.tsx`
- [x] 3.3 Update `app/(marketing)/cookies/page.tsx`
- [x] 3.4 Update `app/(marketing)/security/page.tsx`
- [x] 3.5 Update `app/(marketing)/acceptable-use/page.tsx`

## 4. Spot Fixes — Existing Pages

- [x] 4.1 Update `app/(marketing)/integrations/page.tsx`
- [x] 4.2 Update `app/(marketing)/accountants/page.tsx`
- [x] 4.3 Update `app/(marketing)/contact/page.tsx`
- [x] 4.4 Update `components/marketing/MarketingFooter.tsx`

## 5. Cleanup

- [x] 5.1 Delete `components/marketing/PlaceholderPage.tsx` once all import sites in tasks 2.1–2.8 are complete
- [x] 5.2 Verify no remaining usages of `PlaceholderPage` with `grep -r PlaceholderPage app/ components/`

## 6. Validation

- [x] 6.1 Run `grep -r "\[PLACEHOLDER" app/` — confirm zero matches
- [x] 6.2 Run `grep -r "Coming soon — this page is a placeholder\|Content is being prepared\|not legally binding\|\[see footer\]" app/ components/` — confirm zero matches
- [x] 6.3 Run `grep -r "details TBA\|This site is not live yet" app/ components/` — confirm zero matches
- [x] 6.4 Run `npm run lint` — confirm zero lint errors
- [x] 6.5 Run `npx tsc --noEmit` — confirm zero type errors (dev cache errors excluded)
- [x] 6.6 Run `npm run build` — confirm clean build
