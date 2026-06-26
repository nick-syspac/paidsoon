import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Acceptable Use Policy — PaidSoon",
  description:
    "PaidSoon Acceptable Use Policy — the rules governing permitted and prohibited use of the PaidSoon platform, operated by Syspac Pty Ltd.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg px-5 py-4 mb-10 text-sm text-amber-900">
      <strong>[PLACEHOLDER — requires professional legal review before production launch]</strong>
      <br />
      This content is draft placeholder material. It is <strong>not legally binding</strong>.
    </div>
  )
}

export default function AcceptableUsePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Acceptable Use Policy</h1>
        <LegalDisclaimer />

        <div className="prose prose-gray max-w-none text-sm text-gray-600 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">About this policy</h2>
            <p>
              This Acceptable Use Policy governs your use of PaidSoon, operated by Syspac Pty Ltd.
              By using PaidSoon, you agree to comply with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Permitted use</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sending invoice reminder emails to clients who genuinely owe you money.</li>
              <li>Connecting legitimate business accounting or payment accounts that you own or are authorised to manage.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Prohibited use</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sending unsolicited or spam emails via the PaidSoon platform.</li>
              <li>Using PaidSoon to harass, intimidate, or threaten individuals.</li>
              <li>Connecting accounts you do not own or are not authorised to manage.</li>
              <li>Attempting to circumvent rate limits, security controls, or authentication.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Enforcement</h2>
            <p>[PLACEHOLDER — describe consequences of policy violations and account termination process.]</p>
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
