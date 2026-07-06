## Why

Users can submit enquiries from the Get in touch/contact page, but there is no explicit routing contract that guarantees each enquiry type reaches the right internal inbox via Resend. Defining this now prevents missed leads and support requests while giving implementation a clear, testable behavior contract.

## What Changes

- Add server-side contact enquiry email delivery via Resend for `/contact` submissions.
- Route enquiry messages by enquiry type to designated destination addresses.
- Define required validation and error handling for unsupported enquiry types and failed send attempts.
- Establish auditable behavior for mapping changes so future updates do not silently misroute messages.

## Capabilities

### New Capabilities
- `contact-enquiry-routing`: Accept contact-page enquiry submissions and send them through Resend to type-specific internal recipient addresses.

### Modified Capabilities
- None.

## Impact

- Affected areas: contact form submission flow under `app/(marketing)/contact/`, API route handling under `app/api/`, and email integration in `lib/email/`.
- External dependency: Resend transactional email API.
- Operational impact: internal inbox routing by enquiry type:
  - Sales -> sales@paidsoon.com.au
  - Support -> support@paidsoon.com.au
  - Accounting Partnerships -> partnerships@padisoon.com.au
