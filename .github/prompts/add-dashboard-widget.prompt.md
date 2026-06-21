---
mode: agent
description: Add a new dashboard widget or metric card to the PaidSoon dashboard.
---

# Add Dashboard Widget — PaidSoon

## Role
You are a senior frontend engineer adding a new metric card or widget to the PaidSoon dashboard.

## Goal
Implement a new dashboard widget that displays invoice or payment metrics for the logged-in user, following PaidSoon's component, data, and styling conventions.

## PaidSoon Context
The main dashboard is at `app/dashboard/page.tsx`. It uses Server Components to fetch data. Client-side interactive parts use `"use client"` components. Styling is Tailwind CSS 4.

## Files to Inspect
- `app/dashboard/page.tsx` — dashboard page data fetching and layout
- `app/dashboard/layout.tsx` — shared layout
- `components/dashboard/InvoiceTable.tsx` — example dashboard component
- `components/dashboard/UpgradeBanner.tsx` — upsell component
- `components/dashboard/LockedDashboardPreview.tsx` — locked feature component
- `components/ui/Spinner.tsx` — loading spinner
- `lib/dashboardUpsell.ts` — upsell model
- `lib/billing.ts` — feature gate helpers
- `prisma/schema.prisma` — data available for metrics

## Widget Conventions

### Data Fetching
- Fetch data in the **Server Component** (page or a server async component), not in the widget itself
- Pass pre-fetched, pre-formatted data as props to the widget
- `amountDue` is in cents — format before passing to UI:
  ```ts
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amountDue / 100)
  ```

### Component Structure
```tsx
// components/dashboard/MetricCard.tsx — Server Component (no state needed)
interface MetricCardProps {
  title: string
  value: string
  description?: string
}

export function MetricCard({ title, value, description }: MetricCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
      {description && <p className="text-sm">{description}</p>}
    </div>
  )
}
```

### Feature Gating
If the widget is tier-gated, show `LockedDashboardPreview` or `UpgradeBanner` for users without access:
```tsx
if (!hasPlanFeature(tier, "payment_status_dashboard")) {
  return <LockedDashboardPreview />
}
```

### Accessibility
- Widget containers should have semantic HTML (e.g., `<section>`, `<article>`)
- Meaningful headings for screen readers
- Numeric values should have context (e.g., aria-label)

### Responsive Layout
- Use Tailwind grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Widgets should stack on mobile

## Rules
- Never fetch data inside a `"use client"` widget — data flows down from server
- Never include `clientEmail` in widget output
- Map DB data to display-safe shapes before passing as props
- Keep widget components in `components/dashboard/`

## Expected Output
1. New component file in `components/dashboard/`
2. Updated `app/dashboard/page.tsx` to include the widget
3. Data query in the page's server-side data fetching
4. Tests for any business logic in the widget's data preparation

## Acceptance Criteria
- Widget displays correct data for the logged-in user
- Feature-gated widgets show upgrade prompt for ineligible users
- No PII in widget output
- Responsive on mobile
- No TypeScript errors
