import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Blog — PaidSoon",
  description:
    "Practical articles for small businesses, freelancers, bookkeepers and accountants who want to improve cash flow and reduce time spent chasing overdue invoices.",
}

const comingArticles = [
  {
    title: "How to follow up overdue invoices without damaging client relationships",
    description:
      "A practical guide to sending polite, consistent reminders while keeping the tone professional.",
  },
  {
    title: "What to include in an invoice reminder email",
    description:
      "A breakdown of the key details every reminder should include: invoice number, amount due, due date, payment link, and next step.",
  },
  {
    title: "Why consistent follow-up improves cash flow",
    description:
      "How small businesses can reduce debtor days by making invoice follow-up systematic rather than ad hoc.",
  },
  {
    title: "Promise-to-pay tracking: why it matters",
    description:
      "How recording payment commitments helps you avoid unnecessary reminders and improves client communication.",
  },
  {
    title: "When to pause invoice reminders",
    description:
      "How to handle disputes, partial payments and special circumstances without losing track of the invoice.",
  },
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold text-gray-900">Blog</h1>
        <p className="mt-4 text-lg text-gray-500">
          Practical articles for small businesses, freelancers, bookkeepers and accountants who want
          to improve cash flow and reduce time spent chasing overdue invoices.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">
          Coming articles
        </h2>
        <div className="space-y-6">
          {comingArticles.map((article) => (
            <div key={article.title} className="border-b border-gray-100 pb-6">
              <h3 className="font-semibold text-gray-900 mb-1">{article.title}</h3>
              <p className="text-sm text-gray-500">{article.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-gray-50 rounded-xl p-6">
          <p className="text-sm text-gray-600">
            Want a topic covered?{" "}
            <Link href="/contact" className="text-blue-600 hover:underline font-medium">
              Contact us
            </Link>{" "}
            with questions you would like us to answer in a future article.
          </p>
        </div>
      </section>
    </div>
  )
}

