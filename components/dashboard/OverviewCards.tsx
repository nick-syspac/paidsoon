import Link from "next/link"
import type { CardSeverity, OverviewCard } from "@/lib/dashboard/overviewCards"

const SEVERITY_STYLES: Record<CardSeverity, { dot: string; border: string; bg: string }> = {
  green: { dot: "bg-green-500", border: "border-green-200", bg: "bg-green-50" },
  yellow: { dot: "bg-amber-500", border: "border-amber-200", bg: "bg-amber-50" },
  red: { dot: "bg-red-500", border: "border-red-200", bg: "bg-red-50" },
}

export function OverviewCards({ cards }: { cards: OverviewCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const styles = SEVERITY_STYLES[card.severity]
        return (
          <Link
            key={card.id}
            href={card.href}
            className={`rounded-lg border ${styles.border} ${styles.bg} p-4 hover:shadow-sm transition-shadow`}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${styles.dot}`}
              />
              <span className="text-xs font-medium text-gray-600">{card.label}</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-gray-900">{card.stat}</p>
            {card.detail && <p className="mt-1 text-xs text-gray-500">{card.detail}</p>}
          </Link>
        )
      })}
    </div>
  )
}
