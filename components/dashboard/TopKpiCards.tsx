import Link from "next/link"
import type { TopKpiCard } from "@/lib/dashboard/topKpiCards"

export function TopKpiCards({ cards }: { cards: TopKpiCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Link
          key={card.id}
          href={card.href}
          className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <span aria-hidden="true">{card.icon}</span>
            <span>{card.label}</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-gray-900">{card.value}</p>
          {card.detail && <p className="mt-1 text-xs text-gray-500">{card.detail}</p>}
        </Link>
      ))}
    </div>
  )
}
