import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About PaidSoon — Syspac Pty Ltd",
  description:
    "PaidSoon is an automated invoice follow-up tool for Australian freelancers, sole traders and small businesses. Operated by Syspac Pty Ltd, ABN 12 657 226 125.",
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">About PaidSoon</h1>

        <div className="prose prose-gray max-w-none text-gray-600 space-y-6">
          <p className="text-lg leading-relaxed">
            PaidSoon was built to solve a simple but painful problem for small businesses: getting
            paid should not depend on remembering to chase every overdue invoice yourself.
          </p>

          <p>
            Many freelancers, sole traders and small businesses do good work, send invoices on time,
            and then lose hours following up late payments. The conversations can feel awkward,
            reminders are easy to forget, and cash flow becomes harder to plan.
          </p>

          <p>
            PaidSoon automates the follow-up process. It connects to your payment or accounting
            platform, monitors unpaid invoices, and sends polite, professional reminders on your
            behalf. You stay in control of the tone, timing and escalation path, while PaidSoon
            handles the repetitive chasing.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Why we built it</h2>
            <p>
              We believe invoice follow-up should be consistent, professional and calm. PaidSoon
              helps business owners:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>reduce time spent chasing overdue invoices</li>
              <li>improve cash-flow visibility</li>
              <li>keep client relationships professional</li>
              <li>track promises to pay and disputes</li>
              <li>give accountants and bookkeepers better debtor visibility</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">
              Built for Australian small businesses
            </h2>
            <p>
              PaidSoon is designed for Australian businesses that want a simple, affordable way to
              improve payment follow-up without introducing heavy finance software or complex debt
              collection processes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Company details</h2>
            <p>PaidSoon is operated by Syspac Pty Ltd.</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-16">ABN</dt>
                <dd>12 657 226 125</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-16">Address</dt>
                <dd>
                  Level 4
                  <br />
                  152 Elizabeth Street
                  <br />
                  Melbourne. VIC. 3000
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-16">Country</dt>
                <dd>Australian owned and operated</dd>
              </div>
            </dl>
          </section>

          <div className="mt-10 pt-8 border-t border-gray-100">
            <Link
              href="/contact"
              className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Get in touch →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

