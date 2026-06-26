import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service — PaidSoon",
  description:
    "PaidSoon Terms of Service — the agreement between you and Syspac Pty Ltd governing your use of the PaidSoon platform.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg px-5 py-4 mb-10 text-sm text-amber-900">
      <strong>[PLACEHOLDER — requires professional legal review before production launch]</strong>
      <br />
      This content is draft placeholder material. It has not been reviewed by a qualified legal
      professional and is <strong>not legally binding</strong>.
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
            <p>[PLACEHOLDER — describe permitted and prohibited uses, account responsibilities, and service availability.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Subscription and billing</h2>
            <p>[PLACEHOLDER — describe subscription tiers, billing cycles, cancellation, and refund policy.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Limitation of liability</h2>
            <p>[PLACEHOLDER — describe limitation of liability and warranty disclaimers.]</p>
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
