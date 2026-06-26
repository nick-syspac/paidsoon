import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — PaidSoon",
  description:
    "PaidSoon Privacy Policy — how Syspac Pty Ltd collects, uses, and protects your personal information.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg px-5 py-4 mb-10 text-sm text-amber-900">
      <strong>[PLACEHOLDER — requires professional legal review before production launch]</strong>
      <br />
      This content is draft placeholder material prepared by Syspac Pty Ltd. It has not been reviewed
      by a qualified legal professional and is <strong>not legally binding</strong>. Do not publish
      this page to live users without a full legal review.
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
              PaidSoon is operated by Syspac Pty Ltd (ABN: [see footer]), an Australian company. This
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
            <p>[PLACEHOLDER — describe purpose of collection, legal basis, and retention period.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Your rights</h2>
            <p>
              You have the right to access, correct, or delete your personal information. To exercise
              these rights, contact us at{" "}
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
