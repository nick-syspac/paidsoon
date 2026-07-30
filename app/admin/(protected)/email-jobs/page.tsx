import { prismaAdmin } from "@/lib/db/admin"

export default async function AdminEmailJobsPage() {
  const emailLogs = await prismaAdmin.emailLog.findMany({
    orderBy: { sentAt: "desc" },
    take: 50,
    select: {
      id: true,
      trackedInvoiceId: true,
      stage: true,
      sentAt: true,
      fromAddress: true,
      subject: true,
      resendMessageId: true,
      // clientEmail intentionally excluded
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Email Jobs</h1>
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">From</th>
            </tr>
          </thead>
          <tbody>
            {emailLogs.map((l) => (
              <tr key={l.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(l.sentAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-400">{l.stage}</td>
                <td className="px-4 py-3 text-gray-200 truncate max-w-xs">{l.subject}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{l.fromAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
