## 1. Recommendation and Preview Foundations

- [x] 1.1 Add helper logic to compute next-tier recommendation from current tier (Starter -> Solo, Solo -> Small Business)
- [x] 1.2 Add near-limit evaluation helper using configured threshold and feature-intent signals
- [x] 1.3 Add typed sample preview data model for locked overdue dashboard rows

## 2. Locked Dashboard Experience

- [x] 2.1 Create a locked-state preview component that renders sample invoice rows and explicit "Sample preview" labeling
- [x] 2.2 Replace existing lock-state banner in dashboard with sample preview + adaptive recommendation block
- [x] 2.3 Ensure locked state never renders live overdue/payment-status invoice rows

## 3. Copy and CTA Behavior

- [x] 3.1 Add plan-specific upgrade copy for Starter and Solo locked states
- [x] 3.2 Add near-limit copy variant when usage threshold or feature-intent condition is met
- [x] 3.3 Wire CTA destination and label to recommended next plan

## 4. Validation

- [x] 4.1 Add tests for recommendation helper (next-tier mapping and near-limit behavior)
- [x] 4.2 Add tests for locked preview rendering and sample-data labeling
- [ ] 4.3 Verify Starter and Solo UX manually in dashboard for overdue and payment-status locked states
