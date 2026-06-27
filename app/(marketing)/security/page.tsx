import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security — PaidSoon",
  description:
    "How PaidSoon (Syspac Pty Ltd) keeps your invoice data and account secure.",
}

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Security</h1>

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
            <p className="mb-3">
              PaidSoon is built using modern managed cloud services, including:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Vercel for hosting the web application</li>
              <li>Supabase for database, authentication and storage services</li>
              <li>Stripe Connect for secure payment account authorisation</li>
              <li>
                email delivery infrastructure for transactional invoice reminders and account
                notifications
              </li>
            </ul>
            <p className="mt-3">
              We use managed providers so that security updates, availability controls and platform
              monitoring can be handled using established cloud infrastructure. Data residency and
              provider-region details may vary depending on the services used and will be reviewed as
              PaidSoon moves from private beta to production.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access control</h2>
            <p>
              Access to PaidSoon systems is limited to authorised personnel. Administrative access is
              protected using strong authentication and least-privilege principles wherever practical.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Audit logging</h2>
            <p>
              PaidSoon records key events such as account connection, invoice sync, reminder sends,
              promise-to-pay updates, dispute pauses and manual workflow actions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Responsible disclosure</h2>
            <p>
              If you believe you have found a vulnerability, contact{" "}
              <a href="mailto:security@paidsoon.com.au" className="text-blue-600 hover:underline">
                security@paidsoon.com.au
              </a>
              . Please include enough detail for us to reproduce the issue and do not publicly
              disclose the issue until we have had a reasonable opportunity to investigate.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
