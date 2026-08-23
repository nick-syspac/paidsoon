## 1. Email Flow Validation

- [ ] 1.1 Confirm the invoice normalization path preserves `paymentUrl` for overdue invoices with a hosted payment URL.
- [ ] 1.2 Confirm the reminder send path passes the stored URL to the email template without dropping it.
- [ ] 1.3 Verify the template omits the CTA cleanly when the invoice has no valid payment URL.

## 2. Render Safety

- [ ] 2.1 Add a regression test covering the populated `paymentUrl` case for both HTML and text reminder output.
- [ ] 2.2 Add a regression test covering the absent `paymentUrl` case so the email remains valid and non-broken.
- [ ] 2.3 Ensure the payment CTA is only rendered when the value is non-empty and safe to display.

## 3. Release Proof

- [ ] 3.1 Run the focused reminder/email tests.
- [ ] 3.2 Review the generated email output to confirm the pay CTA is visible when intended and absent when not.
- [ ] 3.3 Confirm the release criterion is satisfied: reminder emails include a valid payment link when available and remain safe otherwise.
