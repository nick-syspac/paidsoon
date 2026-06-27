import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Careers at PaidSoon — Syspac Pty Ltd",
  description:
    "PaidSoon is not currently advertising open roles. Interested in future opportunities? Get in touch via the contact page.",
}

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Careers</h1>

        <div className="prose prose-gray max-w-none text-gray-600 space-y-6">
          <p className="text-lg">PaidSoon is not currently advertising open roles.</p>

          <p>
            We are a small Australian software business building practical tools for freelancers,
            small businesses, accountants and bookkeepers. As the product grows, we expect to need
            help across engineering, product support, customer success, content and partnerships.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">
              Interested in future opportunities?
            </h2>
            <p>
              If you are interested in what we are building, you are welcome to get in touch through
              the contact page. Tell us a little about your background, the kind of work you enjoy,
              and why PaidSoon interests you.
            </p>
            <div className="mt-6">
              <Link
                href="/contact"
                className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Get in touch →
              </Link>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">Current openings</h2>
            <p className="text-gray-500">There are no current advertised roles.</p>
          </section>
        </div>
      </div>
    </div>
  )
}

