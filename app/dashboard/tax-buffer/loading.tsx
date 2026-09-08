import { Spinner } from "@/components/ui/Spinner"

export default function TaxBufferLoading() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <Spinner className="h-4 w-4" />
        <span>Loading Tax Buffer...</span>
      </div>
    </div>
  )
}
