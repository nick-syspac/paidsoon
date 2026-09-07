"use client"

export default function SpendLeakError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-900">Unable to load SpendLeak</h2>
      <p className="text-sm text-red-800">Please try again. If this keeps happening, contact support.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800"
      >
        Retry
      </button>
    </div>
  )
}
