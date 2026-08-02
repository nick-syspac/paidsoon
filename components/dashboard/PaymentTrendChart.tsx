import type { PaymentTrendPoint } from "@/lib/dashboard/paymentTrend"

const WIDTH = 320
const HEIGHT = 120
const PADDING = 8

function buildPoints(values: number[], max: number): string {
  if (values.length === 0) return ""
  const step = values.length > 1 ? (WIDTH - PADDING * 2) / (values.length - 1) : 0
  return values
    .map((value, index) => {
      const x = PADDING + step * index
      const y = HEIGHT - PADDING - (max === 0 ? 0 : (value / max) * (HEIGHT - PADDING * 2))
      return `${x},${y}`
    })
    .join(" ")
}

export function PaymentTrendChart({ points }: { points: PaymentTrendPoint[] }) {
  const maxValue = Math.max(1, ...points.map((point) => point.outstanding), ...points.map((point) => point.paymentsReceived))
  const hasData = points.some((point) => point.outstanding > 0 || point.paymentsReceived > 0)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-600">Payment Trend</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> Outstanding
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" /> Payments received
          </span>
        </div>
      </div>
      {!hasData ? (
        <p className="mt-4 text-sm text-gray-500">Not enough history yet to show a trend.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="mt-4 w-full"
            role="img"
            aria-label="Outstanding balance and payments received over the last few weeks"
          >
            <polyline
              points={buildPoints(
                points.map((p) => p.outstanding),
                maxValue,
              )}
              fill="none"
              stroke="rgb(239 68 68)"
              strokeWidth={2}
            />
            <polyline
              points={buildPoints(
                points.map((p) => p.paymentsReceived),
                maxValue,
              )}
              fill="none"
              stroke="rgb(34 197 94)"
              strokeWidth={2}
            />
          </svg>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
        </>
      )}
    </div>
  )
}
