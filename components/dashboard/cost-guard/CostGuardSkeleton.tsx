export function CostGuardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="mt-4 h-8 w-28 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-40 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="h-3 w-28 rounded bg-gray-200" />
        <div className="mt-4 h-6 w-52 rounded bg-gray-200" />
        <div className="mt-3 h-4 w-full max-w-md rounded bg-gray-100" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-gray-200 p-3">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-3 w-full rounded bg-gray-100" />
                <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="h-5 w-32 rounded bg-gray-200" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex justify-between">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-3 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
