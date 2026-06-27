import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cookie Policy — PaidSoon",
  description:
    "PaidSoon Cookie Policy — how Syspac Pty Ltd uses cookies and similar tracking technologies on the PaidSoon platform.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 mb-10 text-sm text-blue-900">
      <strong>Draft Cookie Policy — pending legal review</strong>
      <br />
      This Cookie Policy is provided as draft information and should be reviewed before production
      launch.
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
            <p className="mb-3">
              You can control or delete cookies through your browser settings. Most browsers allow
              you to block cookies, delete existing cookies or receive a warning before cookies are
              stored.
            </p>
            <p className="mb-3">
              If you block essential cookies, parts of PaidSoon may not work properly, including
              login, account security and dashboard sessions.
            </p>
            <p>
              Where analytics cookies are used, PaidSoon will use them to understand product usage,
              improve the service and diagnose issues. We do not use cookies to sell personal
              information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Changes to this policy</h2>
            <p>
              We may update this Cookie Policy as our service, analytics tools or legal obligations
              change.
            </p>
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
