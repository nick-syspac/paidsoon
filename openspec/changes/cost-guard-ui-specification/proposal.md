## Why

PaidSoon already has a Cost Guard foundation and alerting model, but the product still lacks a coherent owner-facing user experience for reviewing risk, understanding the cause, and taking action. The missing gap is not just logic; it is the interface itself: business owners need a dashboard that tells them whether spending is under control, what changed, why it matters, and what to do next without accounting jargon.

The UI specification closes that gap by turning Cost Guard into a visible, decision-support module inside PaidSoon. It makes the normal user journey obvious: from dashboard visibility, to alert review, to supplier/category drill-down, to rule and settings configuration, all within the same product language as the rest of PaidSoon.

## What Changes

- **NEW** Cost Guard module navigation and route structure for overview, alerts, suppliers, categories, rules, and settings
- **NEW** Owner-facing overview dashboard with four KPI cards, cost health status, action-focused alert summaries, forecast, trend, and recurring-change panels
- **NEW** Alert detail experience that explains the variance, baseline, affected transactions, and recommended action in plain English
- **NEW** Supplier, category, and rule management UX consistent with the rest of PaidSoon and designed for non-accountant users
- **NEW** Settings experience for sensitivity, minimum impact thresholds, exclusions, notifications, and data-source status
- **MODIFIED** PaidSoon dashboard and notification centre to surface Cost Guard status and critical issues without recreating the full module
- **MODIFIED** Cost Guard interactions maintain a read-only / admin-safe posture: explain, investigate, resolve, snooze, or mark as expected without giving the user accounting-editing tools

## Capabilities

### New Capabilities

- `cost-guard-ui`: owner-facing Cost Guard UX for overview, alerts, suppliers, categories, rules, settings, and lifecycle actions

### Modified Capabilities

- `cost-guard-alerts`: expand the alert lifecycle and detail experience to include human-readable explanations, financial summaries, and audit actions
- `dashboard-overview`: surface Cost Guard status and risk signals as part of the primary PaidSoon dashboard and notification centre

## Impact

- **Front-end**: new routes under `/cost-guard`, `/cost-guard/alerts`, `/cost-guard/suppliers`, `/cost-guard/categories`, `/cost-guard/rules`, and `/settings/cost-guard`
- **Shared components**: summary cards, status badges, alert cards, filters, tables, empty/error states, trend charts, settings cards, and confirmation dialogs
- **Backend contract**: UI will consume display-ready analytical responses from existing Cost Guard API surfaces rather than calculating financial logic in React components
- **Product language**: all copy, severity labels, empty states, and actions use plain English and operational prioritisation instead of accounting terminology
- **Accessibility**: keyboard navigation, screen-reader labels, focus visibility, semantic table headings, and colour-plus-text severity design are required
