import type { Metadata } from "next"
import Link from "next/link"
import { ContactForm } from "@/components/marketing/ContactForm"

export const metadata: Metadata = {
  title: "Contact Us — PaidSoon",
  description:
    "Get in touch with the PaidSoon team for sales enquiries, support, or accountant partnership discussions.",
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900">Get in touch</h1>
          <p className="mt-3 text-lg text-gray-500">
            We&apos;d love to hear from you. Sales, support, or partnership — we&apos;re here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start">
          {/* Contact form */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Send us a message</h2>
            <ContactForm />
          </div>

          {/* Right panel */}
          <div className="space-y-8">
            {/* Demo CTA */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Request a demo</h3>
              <p className="text-sm text-gray-600 mb-4">
                Want to see PaidSoon in action before signing up? We&apos;ll walk you through the product
                and answer your questions live.
              </p>
              <Link
                href="/contact?type=Sales"
                className="inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Book a demo →
              </Link>
            </div>

            {/* Direct contact */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Other ways to reach us</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Support:</span>{" "}
                  <a href="mailto:support@paidsoon.com.au" className="text-blue-600 hover:underline">
                    support@paidsoon.com.au
                  </a>
                </p>
                <p>
                  <span className="font-medium">Partnerships:</span>{" "}
                  <a href="mailto:partnerships@paidsoon.com.au" className="text-blue-600 hover:underline">
                    partnerships@paidsoon.com.au
                  </a>
                </p>
                <p className="text-gray-400 text-xs mt-2">We aim to respond within one business day.</p>
              </div>
            </div>

            {/* Accountant CTA */}
            <div className="border border-gray-200 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Are you an accountant or bookkeeper?</h3>
              <p className="text-sm text-gray-600 mb-3">
                Learn about our Accountant Partner programme — manage invoice follow-ups for all your clients
                from one dashboard.
              </p>
              <Link href="/accountants" className="text-sm text-blue-600 hover:underline font-medium">
                Learn about the partner programme →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
