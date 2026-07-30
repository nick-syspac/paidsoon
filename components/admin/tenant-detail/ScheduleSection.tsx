import type { Schedule } from "@/lib/generated/prisma/client"

interface Props {
  schedule: Schedule | null
}

export function ScheduleSection({ schedule }: Props) {
  if (!schedule) {
    return (
      <section className="bg-gray-900 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Follow-up Schedule</h2>
        <p className="text-sm text-gray-500">No schedule configured (using defaults)</p>
      </section>
    )
  }

  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Follow-up Schedule</h2>
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center bg-gray-800 rounded p-3">
          <dt className="text-gray-500 text-xs mb-1">Email 1</dt>
          <dd className="text-gray-100 text-lg font-medium">{schedule.email1DaysAfterDue}d</dd>
          <dd className="text-gray-500 text-xs">after due</dd>
        </div>
        <div className="text-center bg-gray-800 rounded p-3">
          <dt className="text-gray-500 text-xs mb-1">Email 2</dt>
          <dd className="text-gray-100 text-lg font-medium">{schedule.email2DaysAfterDue}d</dd>
          <dd className="text-gray-500 text-xs">after due</dd>
        </div>
        <div className="text-center bg-gray-800 rounded p-3">
          <dt className="text-gray-500 text-xs mb-1">Email 3</dt>
          <dd className="text-gray-100 text-lg font-medium">{schedule.email3DaysAfterDue}d</dd>
          <dd className="text-gray-500 text-xs">after due</dd>
        </div>
      </dl>
    </section>
  )
}
