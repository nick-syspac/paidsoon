import type { ReactNode } from "react"
import Link from "next/link"
import { helpSource } from "@/lib/help/source"
import { HelpSearch } from "@/components/help/HelpSearch"

const GUIDE_SECTION_ORDER = [
  "getting-started",
  "onboarding",
  "integrations",
  "invoice-workflows",
  "billing-subscription",
  "account-settings",
] as const

const GUIDE_SECTION_LABELS: Record<(typeof GUIDE_SECTION_ORDER)[number], string> = {
  "getting-started": "Start here",
  onboarding: "Onboarding",
  integrations: "Integrations",
  "invoice-workflows": "Invoice workflows",
  "billing-subscription": "Billing and subscription",
  "account-settings": "Account and settings",
}

type GuideSection = (typeof GUIDE_SECTION_ORDER)[number]

function asGuideSection(value: unknown): GuideSection {
  return typeof value === "string" && GUIDE_SECTION_ORDER.includes(value as GuideSection)
    ? (value as GuideSection)
    : "invoice-workflows"
}

function toGuideOrder(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 999
}

export default function HelpLayout({ children }: { children: ReactNode }) {
  const pages = [...helpSource.getPages()].map((page) => {
    const docData = page.data as {
      title?: string
      guideSection?: unknown
      guideOrder?: unknown
    }

    return {
      page,
      section: asGuideSection(docData.guideSection),
      order: toGuideOrder(docData.guideOrder),
    }
  })

  const groupedPages = GUIDE_SECTION_ORDER.map((section) => ({
    section,
    pages: pages
      .filter((entry) => entry.section === section)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        if (a.page.url === "/help") return -1
        if (b.page.url === "/help") return 1
        return a.page.data.title.localeCompare(b.page.data.title)
      }),
  })).filter((entry) => entry.pages.length > 0)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 flex gap-10">
      <nav aria-label="Help topics" className="hidden md:block w-56 shrink-0">
        <div className="sticky top-20">
          <HelpSearch />
          <div className="space-y-5">
            {groupedPages.map((group) => (
              <section key={group.section}>
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  {GUIDE_SECTION_LABELS[group.section]}
                </p>
                <ul className="space-y-1">
                  {group.pages.map(({ page }) => (
                    <li key={page.url}>
                      <Link
                        href={page.url}
                        className="block text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded px-2 py-1.5"
                      >
                        {page.data.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
