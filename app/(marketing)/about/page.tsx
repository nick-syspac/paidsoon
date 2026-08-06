import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About PaidSoon — Syspac Pty Ltd",
  description:
    "PaidSoon is the financial control platform for Australian businesses. Operated by Syspac Pty Ltd, ABN 12 657 226 125.",
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">About PaidSoon</h1>

        <div className="prose prose-gray max-w-none text-gray-600 space-y-6">
          <p className="text-lg leading-relaxed">
            <strong className="text-gray-900">
              PaidSoon is the financial control platform for Australian businesses.
            </strong>
          </p>

          <p>
            Your accounting software records what has already happened. PaidSoon turns that
            information into practical actions that help you collect money sooner, control
            spending, prepare for upcoming bills and make better financial decisions.
          </p>

          <p>
            <strong className="text-gray-900">
              Accounting records the past. PaidSoon helps you control the future.
            </strong>
          </p>

          <p>
            PaidSoon connects to your payment and accounting systems, surfaces what needs attention
            next, and helps you stay ahead of cash flow pressure with practical follow-up,
            planning and control.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Why we built it</h2>
            <p>
              We believe business owners need more than static records. PaidSoon helps Australian
              businesses turn financial information into practical control by helping them:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>collect money sooner</li>
              <li>control spending with clearer priorities</li>
              <li>prepare for upcoming bills with better visibility</li>
              <li>keep follow-up and cash decisions practical and consistent</li>
              <li>make better financial decisions with less guesswork</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">
              Built for Australian small businesses
            </h2>
            <p>
              PaidSoon is designed for Australian businesses that want a simple, affordable layer
              of financial control on top of the systems they already use, without adding heavy
              finance software or complex operational overhead.
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

