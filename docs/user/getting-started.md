# Getting started with PaidSoon

Use this checklist after signing in to set up your account and the data used by PaidSoon. The guides are based on the current dashboard; available Settings items and actions vary by subscription.

## 1. Open Settings and check your account

From the signed-in dashboard, open **Settings** and select **Account**. Review your account email, subscription status, and display name. You can edit the display name here; the email address is shown for reference and cannot be changed from this screen.

## 2. Review your subscription

Open **Settings → Subscription** to check your current plan and billing status. Use the available plan-management actions there if you need to change or manage billing. Some module settings, limits, and actions are plan-gated, so check the relevant guide before setting up a workflow.

## 3. Connect an invoice or accounting source

Open **Settings → Connections**. Connect Stripe to bring in Stripe invoices, or authorize an available accounting connection such as Xero or MYOB Business. Complete authorization with the provider, then return to PaidSoon and check the connection status and recent sync history. If a connection reports an error, use its reconnect or retry action when shown and review the latest sync result.

Do not send anyone your provider password or connection credentials. QuickBooks Online is not currently listed as an available connection.

## 4. Configure InvoiceGuard

In Settings, configure **Schedule**, **Email**, and **Templates** before relying on automated follow-ups. Review the schedule and sender settings against your needs, then check the available reminder templates. The exact timing and email-identity options depend on your plan. See [InvoiceGuard](invoiceguard.md) for the supported controls and Import / Export workflows.

## 5. Confirm your invoice data

Return to the dashboard and confirm that the invoices you expect are present before relying on reminders. You can connect a supported source or use the invoice CSV import described in the InvoiceGuard guide. Invoice import and expense import are separate workflows; importing expenses does not add invoices to InvoiceGuard.

## 6. Set up other modules as needed

Open each module’s guide before configuring it. Some modules need accounting or expense data, and some settings or actions require a higher plan. For example, DepositGuard request creation, Owner’s Digest email delivery, and several analysis modules have their own access conditions. A missing Settings link may indicate a plan gate rather than a setup error.

## Recommended reading order

- [General settings](general-settings.md) for Account, Connections, and Subscription.
- [InvoiceGuard](invoiceguard.md) for invoice reminders and import/export.
- Then choose a module: [DepositGuard](depositguard.md), [SpendLeak](spendleak.md), [Owner’s Digest](owners-digest.md), [CommitGuard](commitguard.md), [Cost Guard](cost-guard.md), [MarginGuard](marginguard.md), [RunwayGuard](runwayguard.md), [Tax Buffer](tax-buffer.md), or [CashPlan](cashplan.md).

## If something is missing or does not update

- Check your subscription and the feature prerequisites in the relevant guide.
- For an accounting connection, inspect its current status and most recent sync result under **Settings → Connections**.
- Confirm the source contains the records you expect and retry a sync if the UI offers that action.
- Do not treat a dashboard estimate or example-like value as a confirmed financial result; the module guides call out current limitations.
