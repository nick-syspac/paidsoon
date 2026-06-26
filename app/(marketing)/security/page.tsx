import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security — PaidSoon",
  description:
    "How PaidSoon (Syspac Pty Ltd) keeps your invoice data and account secure.",
}

function LegalDisclaimer() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg px-5 py-4 mb-10 text-sm text-amber-900">
      <strong>[PLACEHOLDER — requires professional review before production launch]</strong>
      <br />
      This content is draft placeholder material. It is subject to change.
    </div>
  )
}

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Security</h1>
        <LegalDisclaimer />

        <div className="prose prose-gray max-w-none text-sm text-gray-600 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Our security approach</h2>
            <p>
              PaidSoon is operated by Syspac Pty Ltd. We take the security of your invoice data and
              account credentials seriously. The following describes our key security practices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Data protection</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All data is encrypted in transit using TLS.</li>
              <li>Database access is protected by row-level security (RLS) policies.</li>
              <li>OAuth tokens for connected accounting providers are encrypted at rest.</li>
              <li>Authentication is provided by Supabase Auth with support for multi-factor authentication.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Infrastructure</h2>
            <p>[PLACEHOLDER — describe hosting provider (Vercel), database provider (Supabase), and data residency.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Reporting a security issue</h2>
            <p>
              If you discover a security vulnerability, please report it privately to{" "}
              <a href="mailto:security@paidsoon.com.au" className="text-blue-600 hover:underline">
                security@paidsoon.com.au
              </a>
              . Do not disclose vulnerabilities publicly before we&apos;ve had a chance to respond.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
