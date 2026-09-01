import { prismaAdmin as prisma } from "@/lib/db/admin"
import PromiseForm from "./PromiseForm"

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default async function PromisePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const invoice = await prisma.trackedInvoice.findUnique({
    where: { p2pToken: token },
    include: {
      promisesToPay: {
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      financialInvoice: { include: { contact: true } },
    },
  })

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link not found</h1>
          <p className="text-gray-500 text-sm">
            This link is no longer valid or has expired.
          </p>
        </div>
      </div>
    )
  }

  const isSettled =
    invoice.status === "paid" || invoice.status === "manually_resolved"

  if (isSettled) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">All sorted</h1>
          <p className="text-gray-500 text-sm">
            This invoice has already been settled. No action is needed.
          </p>
        </div>
      </div>
    )
  }

  const activePromise = invoice.promisesToPay[0] ?? null
  const amountFormatted = formatCurrency(invoice.financialInvoice.amountDueCents, invoice.financialInvoice.currency)
  const dueDateFormatted = formatDate(invoice.financialInvoice.dueDate)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
            Payment commitment
          </p>
          <h1 className="text-xl font-semibold text-gray-900">
            {invoice.financialInvoice.contact?.name ?? ""}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {amountFormatted} &middot; due {dueDateFormatted}
          </p>
        </div>

        {activePromise && (
          <div className="mb-6 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            You previously committed to pay by{" "}
            <strong>{formatDate(activePromise.promisedPayBy)}</strong>.
            You can update your commitment below.
          </div>
        )}

        <PromiseForm
          token={token}
          invoiceId={invoice.id}
          existingDate={
            activePromise
              ? new Date(activePromise.promisedPayBy).toISOString().split("T")[0]
              : undefined
          }
        />
      </div>
    </div>
  )
}
