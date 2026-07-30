import type { SafeEmailLog } from "@/lib/admin/tenantSnapshot"

interface Props {
  logs: SafeEmailLog[]
}

export function EmailLogSection({ logs }: Props) {
  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Recent Email Log
        <span className="ml-2 text-gray-500 normal-case font-normal">(last 30 days)</span>
      </h2>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">No emails sent in the last 30 days.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-left">
                <th className="pb-2 pr-4 font-normal">Stage</th>
                <th className="pb-2 pr-4 font-normal">Sent</th>
                <th className="pb-2 pr-4 font-normal">Subject</th>
                <th className="pb-2 font-normal">From</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800 last:border-0">
                  <td className="py-2 pr-4 text-gray-400">#{log.stage}</td>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap text-xs">
                    {new Date(log.sentAt).toLocaleString("en-AU")}
                  </td>
                  <td className="py-2 pr-4 text-gray-200">{log.subject}</td>
                  <td className="py-2 text-gray-400 text-xs font-mono">{log.fromAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
