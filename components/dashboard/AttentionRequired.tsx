import Link from "next/link"
import type { NeedsAttentionSummary } from "@/lib/dashboard/attentionRequired"

export function AttentionRequired({ summary }: { summary: NeedsAttentionSummary }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">
        Needs Attention{summary.total > 0 ? ` — ${summary.total}` : ""}
      </h2>
      <ul className="mt-3 space-y-2">
        {summary.categories.map((category) => (
          <li key={category.id}>
            <Link
              href={category.href}
              className="flex items-center justify-between text-sm hover:underline"
            >
              <span className="text-gray-800">{category.label}</span>
              <span className={category.count > 0 ? "font-medium text-red-600" : "text-gray-400"}>
                {category.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
