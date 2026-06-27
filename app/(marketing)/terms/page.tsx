import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service — PaidSoon",
  description:
    "PaidSoon Terms of Service — the agreement between you and Syspac Pty Ltd governing your use of the PaidSoon platform.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 mb-10 text-sm text-blue-900">
      <strong>Draft Terms of Service — pending legal review</strong>
      <br />
      These Terms are provided as draft information for PaidSoon users and early access customers.
      They should be reviewed by a qualified legal professional before full production launch.
    </div>
  )
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
        <LegalDisclaimer />

        <div className="prose prose-gray max-w-none text-sm text-gray-600 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">About these terms</h2>
            <p>
              These Terms of Service govern your use of PaidSoon, operated by Syspac Pty Ltd. By
              using PaidSoon, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Use of the service</h2>
            <p className="mb-3">
              You must use PaidSoon only for lawful business purposes and only in relation to
              invoices, customers and payment accounts that you own or are authorised to manage.
            </p>
            <p className="mb-2">You are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>keeping your account login details secure</li>
              <li>ensuring invoice and customer information is accurate</li>
              <li>configuring reminder schedules and templates appropriately</li>
              <li>ensuring your use of reminder emails complies with applicable laws</li>
              <li>obtaining any permissions required to connect third-party accounts</li>
              <li>promptly pausing reminders where an invoice is disputed or should not be chased</li>
            </ul>
            <p>
              You must not use PaidSoon to send spam, harass people, misrepresent debts, connect
              accounts without authority, interfere with the service, reverse engineer the platform,
              or use PaidSoon for unlawful debt collection activity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Subscription and billing</h2>
            <p className="mb-3">
              PaidSoon may offer free trials, monthly subscription plans and partner plans. Plan
              limits, features and pricing are shown on the pricing page or agreed separately in
              writing.
            </p>
            <p className="mb-2">Unless otherwise stated:</p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>subscriptions are billed monthly in advance</li>
              <li>fees are charged using the payment method linked to your account</li>
              <li>you may cancel at any time from account settings or by contacting support</li>
              <li>cancellation stops future renewals but does not automatically refund past charges</li>
              <li>we may change pricing or plan inclusions with reasonable notice</li>
              <li>taxes may apply depending on your location and account details</li>
            </ul>
            <p>
              Nothing in these Terms excludes rights that cannot be excluded under Australian
              Consumer Law or other applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Limitation of liability</h2>
            <p className="mb-3">
              PaidSoon is provided to help automate invoice follow-up workflows. We do not guarantee
              that any invoice will be paid, that a customer will respond, or that use of the service
              will eliminate bad debts.
            </p>
            <p className="mb-3">
              To the maximum extent permitted by law, Syspac Pty Ltd is not liable for indirect,
              incidental, special or consequential loss, including loss of profit, revenue, goodwill,
              opportunity or data.
            </p>
            <p>
              Where liability cannot be excluded, our liability is limited to the resupply of the
              service or the amount paid by you for the affected service, where permitted by law.
              Nothing in these Terms limits rights or remedies that cannot be excluded under
              Australian Consumer Law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Service availability</h2>
            <p>
              We aim to provide a reliable service, but PaidSoon may be unavailable from time to
              time due to maintenance, updates, outages, third-party provider issues or events
              outside our control.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Third-party services</h2>
            <p>
              PaidSoon connects with third-party services such as Stripe and, in future, accounting
              software providers. Your use of those services is governed by their own terms and
              privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Contact</h2>
            <p>
              Syspac Pty Ltd — legal enquiries:{" "}
              <a href="mailto:legal@paidsoon.com.au" className="text-blue-600 hover:underline">
                legal@paidsoon.com.au
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
