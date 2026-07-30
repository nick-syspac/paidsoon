## 1. API Contract And Validation

- [x] 1.1 Locate the `/contact` submission handler and define/update the request schema to require enquiry type values `Sales`, `Support`, or `Accounting Partnerships`.
- [x] 1.2 Add explicit server-side rejection for unsupported enquiry types with a validation error response.

## 2. Routing And Email Delivery

- [x] 2.1 Implement a typed server-side routing map from enquiry type to destination mailbox (`sales@paidsoon.com.au`, `support@paidsoon.com.au`, `partnerships@padisoon.com.au`).
- [x] 2.2 Wire the contact submission flow to send via the existing Resend email utility using the mapped recipient.
- [x] 2.3 Return an explicit failure response when the Resend send operation fails.

## 3. Observability And Safety

- [x] 3.1 Add structured server logging around contact send attempts and failures without leaking sensitive enquiry content.
- [x] 3.2 Ensure routing logic is centralized in one module/constant so future mapping changes are auditable.

## 4. Verification

- [x] 4.1 Add/extend automated tests to verify sales, support, and accounting-partnership routing outcomes.
- [x] 4.2 Add/extend tests to verify unsupported enquiry types are rejected and no send call occurs.
- [x] 4.3 Add/extend tests to verify Resend failure returns an explicit delivery-failure response.
