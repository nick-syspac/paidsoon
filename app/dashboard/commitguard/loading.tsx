import { Spinner } from "@/components/ui/Spinner"

export default function CommitGuardLoading() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <Spinner className="h-5 w-5 text-blue-600" />
        <span>Loading CommitGuard forecast and commitments...</span>
      </div>
    </div>
  )
}
