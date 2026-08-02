import type { ReactNode } from "react"
import Link from "next/link"
import { helpSource } from "@/lib/help/source"
import { HelpSearch } from "@/components/help/HelpSearch"

export default function HelpLayout({ children }: { children: ReactNode }) {
  const pages = [...helpSource.getPages()].sort((a, b) =>
    a.url === "/help" ? -1 : b.url === "/help" ? 1 : a.data.title.localeCompare(b.data.title)
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 flex gap-10">
      <nav aria-label="Help topics" className="hidden md:block w-56 shrink-0">
        <div className="sticky top-20">
          <HelpSearch />
          <ul className="space-y-1">
            {pages.map((page) => (
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
        </div>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
