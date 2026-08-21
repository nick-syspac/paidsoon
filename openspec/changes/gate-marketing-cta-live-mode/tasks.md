## 1. MarketingNav CTA gating

- [ ] 1.1 Add `liveMode: boolean` prop to `MarketingNav` in `components/marketing/MarketingNav.tsx`
- [ ] 1.2 Update desktop CTA to render "Request early access" → `/contact` when `!liveMode`, "Start Free Trial" → `/sign-up` when `liveMode`
- [ ] 1.3 Update mobile CTA with the same conditional label/href
- [ ] 1.4 Update `app/(marketing)/layout.tsx` to compute `isLiveMode()` and pass it as `liveMode` to `<MarketingNav />`

## 2. Homepage hero CTA gating

- [ ] 2.1 Import `isLiveMode` in `app/(marketing)/page.tsx` and compute it in `HomePage`
- [ ] 2.2 Update hero CTA to render "Request early access" → `/contact` when not live, "Start Free Trial" → `/sign-up` when live

## 3. Verification

- [ ] 3.1 Run `npm run lint` and `npx tsc --noEmit`
- [ ] 3.2 Manually verify with `LIVE` unset/`false`: nav (desktop + mobile) and hero all show "Request early access" → `/contact`
- [ ] 3.3 Manually verify with `LIVE=true`: nav (desktop + mobile) and hero all show "Start Free Trial" → `/sign-up`
- [ ] 3.4 Run `openspec validate gate-marketing-cta-live-mode --type change --strict`
