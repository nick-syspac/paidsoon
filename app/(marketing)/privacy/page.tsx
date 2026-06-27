import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — PaidSoon",
  description:
    "PaidSoon Privacy Policy — how Syspac Pty Ltd collects, uses, and protects your personal information.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 mb-10 text-sm text-blue-900">
      <strong>Draft Privacy Policy — pending legal review</strong>
      <br />
      This Privacy Policy is provided as draft information for PaidSoon users and early access
      customers. It should be reviewed by a qualified legal professional before full production
      launch.
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        <LegalDisclaimer />

        <div className="prose prose-gray max-w-none text-sm text-gray-600 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">About Syspac Pty Ltd</h2>
            <p>
              PaidSoon is operated by Syspac Pty Ltd (ABN: 12 657 226 125), an Australian company. This
              Privacy Policy explains how we collect, use, store, and disclose your personal information
              in connection with the PaidSoon service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">What data we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account information: name, email address, and authentication credentials.</li>
              <li>Invoice data: invoice amounts, due dates, and client contact details imported from your connected accounting or payment provider.</li>
              <li>Usage data: interactions with the PaidSoon dashboard, email open and click events, and reminder send logs.</li>
              <li>Payment information: billing details processed via Stripe on our behalf.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">How we use your data</h2>
            <p className="mb-3">We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>create and manage your PaidSoon account</li>
              <li>connect to authorised payment and accounting providers</li>
              <li>identify unpaid, overdue, paid, disputed and resolved invoices</li>
              <li>send invoice reminder emails according to your configured settings</li>
              <li>show debtor status, follow-up history and reporting inside the dashboard</li>
              <li>record promise-to-pay dates, dispute pauses and manual actions</li>
              <li>provide customer support and respond to enquiries</li>
              <li>manage billing, subscriptions and account administration</li>
              <li>improve, secure and monitor the PaidSoon service</li>
              <li>comply with legal, tax, accounting and regulatory obligations</li>
            </ul>
            <p className="mt-3">We do not sell your personal information.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Disclosure of information</h2>
            <p>
              We may disclose information to service providers who help us operate PaidSoon,
              including hosting, authentication, database, email delivery, payment processing,
              analytics, support and security providers. We only provide the information reasonably
              needed for those services.
            </p>
            <p className="mt-2">
              We may also disclose information where required by law, to protect our rights, to
              investigate misuse of the service, or as part of a business transfer such as a merger,
              acquisition or sale of assets.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Data retention</h2>
            <p>
              We retain account, invoice, reminder and audit information for as long as needed to
              provide PaidSoon, meet legal and accounting obligations, resolve disputes and maintain
              business records. Where information is no longer required, we will take reasonable
              steps to delete or de-identify it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Security</h2>
            <p>
              We use technical and organisational safeguards designed to protect personal
              information, including encrypted connections, access controls, audit logging and secure
              authentication. No system is completely secure, but we work to reduce risk and respond
              promptly to security issues.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Overseas service providers</h2>
            <p>
              Some service providers used to operate PaidSoon may store or process information
              outside Australia. Where this occurs, we take reasonable steps to use reputable
              providers and protect the information handled by them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access and correction</h2>
            <p>
              You may request access to or correction of personal information we hold about you by
              contacting{" "}
              <a href="mailto:privacy@paidsoon.com.au" className="text-blue-600 hover:underline">
                privacy@paidsoon.com.au
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Contact information</h2>
            <p>
              Syspac Pty Ltd — privacy enquiries:{" "}
              <a href="mailto:privacy@paidsoon.com.au" className="text-blue-600 hover:underline">
                privacy@paidsoon.com.au
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
