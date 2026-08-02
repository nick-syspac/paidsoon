import Link from "next/link"
import type { AttentionItem } from "@/lib/dashboard/attentionRequired"

const SEVERITY_ICON: Record<AttentionItem["severity"], string> = {
  red: "🔴",
  orange: "🟠",
}

export function AttentionRequired({ items }: { items: AttentionItem[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Attention Required</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nothing needs your attention right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex items-start gap-2 text-sm hover:underline">
                <span aria-hidden="true">{SEVERITY_ICON[item.severity]}</span>
                <span className="text-gray-800">{item.message}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
