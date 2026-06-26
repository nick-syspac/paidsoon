import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Resources — PaidSoon",
  description:
    "PaidSoon resources hub: blog, help centre, documentation, FAQ, and release notes to help you get the most out of automated invoice follow-ups.",
}

const resources = [
  {
    title: "Blog",
    description: "Tips on cash flow, invoice management, and getting paid faster.",
    href: "/blog",
    cta: "Read the blog →",
  },
  {
    title: "Help Centre",
    description: "Step-by-step guides for setting up and using PaidSoon.",
    href: "/help",
    cta: "Browse help articles →",
  },
  {
    title: "Documentation",
    description: "Technical documentation for API integrations and advanced configuration.",
    href: "/docs",
    cta: "View docs →",
  },
  {
    title: "FAQ",
    description: "Answers to the most common questions about PaidSoon.",
    href: "/faq",
    cta: "Read the FAQ →",
  },
  {
    title: "Release Notes",
    description: "What's new in PaidSoon — feature updates, fixes, and improvements.",
    href: "/release-notes",
    cta: "See what's new →",
  },
]

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Resources</h1>
        <p className="mt-4 text-lg text-gray-500">
          Everything you need to get the most out of PaidSoon.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <Link
              key={resource.href}
              href={resource.href}
              className="block border border-gray-100 rounded-lg p-6 hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <h2 className="font-semibold text-gray-900 mb-2">{resource.title}</h2>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">{resource.description}</p>
              <span className="text-sm text-blue-600 font-medium">{resource.cta}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
