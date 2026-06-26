import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cookie Policy — PaidSoon",
  description:
    "PaidSoon Cookie Policy — how Syspac Pty Ltd uses cookies and similar tracking technologies on the PaidSoon platform.",
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

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Cookie Policy</h1>
        <LegalDisclaimer />

        <div className="prose prose-gray max-w-none text-sm text-gray-600 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">What are cookies?</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website. PaidSoon,
              operated by Syspac Pty Ltd, uses cookies to keep you logged in and to understand how
              the service is used.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Types of cookies we use</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Essential cookies:</strong> required for authentication and session management.</li>
              <li><strong>Analytics cookies:</strong> used to understand usage patterns and improve the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Managing cookies</h2>
            <p>[PLACEHOLDER — describe how users can control or delete cookies via browser settings.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Contact</h2>
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
