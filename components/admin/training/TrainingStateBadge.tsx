import type { TrainingLifecycleState } from "@/lib/help/trainingWorkflow"

const STATE_STYLES: Record<TrainingLifecycleState, string> = {
  draft: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  review: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  published: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
}

export function TrainingStateBadge({ state }: { state: TrainingLifecycleState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}>
      {state}
    </span>
  )
}
