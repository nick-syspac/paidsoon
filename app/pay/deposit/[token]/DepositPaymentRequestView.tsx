function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

export interface DepositPaymentRequestViewProps {
  amountCents: number
  currency: string
  dueDate: Date
  description: string | null
  externalPaymentUrl: string | null
  firstViewedAt: Date | null
  lastViewedAt: Date | null
}

export function DepositPaymentRequestView({
  amountCents,
  currency,
  dueDate,
  description,
  externalPaymentUrl,
  firstViewedAt,
  lastViewedAt,
}: DepositPaymentRequestViewProps) {
  const amountFormatted = formatCurrency(amountCents, currency)
  const dueDateFormatted = formatDate(dueDate)
  const hasPaymentLink = Boolean(externalPaymentUrl)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#1e293b_42%,_#f8fafc_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[2rem] border border-white/15 bg-white/96 shadow-[0_30px_100px_rgba(15,23,42,0.28)]">
          <div className="bg-slate-950 px-8 py-8 text-white sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
              Deposit request
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Review and pay your deposit
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
              This secure payment page contains only the details needed to complete the deposit.
            </p>
          </div>

          <div className="grid gap-8 px-8 py-8 sm:px-10 lg:grid-cols-[1.3fr_0.7fr]">
            <section>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Amount due
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                  {amountFormatted}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Due {dueDateFormatted}
                </p>
                {description ? <p className="mt-4 text-sm leading-6 text-slate-700">{description}</p> : null}
              </div>

              {hasPaymentLink ? (
                <a
                  href={externalPaymentUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                >
                  Continue to payment
                </a>
              ) : (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Payment instructions are not yet configured for this request.
                </div>
              )}
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Status
              </p>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-500">Viewed</dt>
                  <dd className="mt-1 font-medium text-slate-950">
                    {firstViewedAt ? formatDate(firstViewedAt) : "Not yet viewed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Last viewed</dt>
                  <dd className="mt-1 font-medium text-slate-950">
                    {lastViewedAt ? formatDate(lastViewedAt) : "Not yet viewed"}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}