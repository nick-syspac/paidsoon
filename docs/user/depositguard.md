# DepositGuard

DepositGuard tracks jobs that need a deposit, payment requests, outstanding balances, and work that is blocked until a deposit arrives. The dashboard is available on eligible DepositGuard-access plans, but creating deposit requests and opening the request settings require the request entitlement. On the self-serve plans, request management is available on Small Business and Business Pro; Essentials and Business Control can still see job-health and blocked-work signals but cannot manage requests. Small Business supports up to 25 active jobs; Business Pro has no active-job cap in the plan catalog.

## Configure DepositGuard

Open **Settings → DepositGuard** at `/dashboard/settings/deposit-guard`. Set the options that apply to your workflow, then select **Save settings**.

### Rules and reminders

- **Automatic reminders:** turn request reminders on or off. When off, reminders remain manual.
- **Initial reminder offset (days)** and **Before-due reminder offset (days):** set each offset from 0 to 30 days.
- **Send 3-day overdue reminder** and **Send 7-day overdue reminder:** choose whether those overdue reminders are enabled.
- **Block work before deposit:** when enabled, require the requested deposit before the job can start.

Automatic reminders require the relevant plan entitlement. If a setting is unavailable, check your plan and the message shown in the dashboard.

### Payments and metadata

- **Default payment provider:** choose **Manual external link** or **Stripe Connect**. The setting stores a default choice, but the page notes that Stripe Connect availability depends on the current payment-provider integration. Selecting it does not guarantee that a Stripe payment flow is available for every request.
- **Advanced metadata JSON:** optional metadata for future branding or integration-specific fields. Leave it blank unless you have a specific reason to use it; if entered, it must be a JSON object. It does not configure arbitrary integrations today.

## Create and monitor a job

1. Open the **DepositGuard** dashboard at `/dashboard/deposit-guard` and choose **Create job**.
2. Follow the four-step wizard: **Customer**, **Quote / job**, **Deposit**, and **Review**. Enter a job name and relevant quote, amount, currency, tax, reference, and date details.
3. Choose no deposit, a percentage, or a fixed deposit amount. Review the server-calculated preview and rounding choice.
4. Choose whether to send the first request now. If you do, provide its due date and wait for the preview to finish before submitting.
5. Create the job, then open it from the dashboard to review its request and payment status.

The dashboard summarizes active jobs, blocked work, outstanding deposits, and overdue requests. Search by job/customer/reference details and filter by job or payment status. An item marked **Blocked** reflects the commencement rule and current deposit state; review the job before starting work.

## Access and limitations

- Essentials and Business Control do not include deposit-request management. Their eligible DepositGuard dashboard can still show job-health and blocked-work information; the settings page and request-creation workflow require the request entitlement.
- Automatic reminders, payment schedules, progress payments, accounting sync, CashPlan forecasting, and advanced reporting have separate entitlements. Do not assume that selecting a payment provider or seeing a plan feature label means every one of those workflows is enabled in the current interface.
- DepositGuard settings affect PaidSoon’s workflow. They do not replace your quote, contract, accounting records, or provider configuration.

For invoice follow-ups rather than job deposits, see [InvoiceGuard](invoiceguard.md).