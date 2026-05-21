interface TemplateVars {
  clientName: string
  invoiceNumber?: string
  amountDue: string // pre-formatted, e.g. "$4,500.00"
  dueDate: string   // pre-formatted date string
  paymentUrl?: string
  freelancerName: string
  daysOverdue?: number
  firmDeadline?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function buildTemplateVars(opts: {
  clientName: string
  invoiceNumber?: string
  amountDue: number
  currency: string
  dueDate: Date
  paymentUrl?: string
  freelancerName: string
}): TemplateVars {
  const now = new Date()
  const daysOverdue = Math.floor(
    (now.getTime() - opts.dueDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const firmDeadlineDate = new Date(now)
  firmDeadlineDate.setDate(firmDeadlineDate.getDate() + 7)

  return {
    clientName: opts.clientName,
    invoiceNumber: opts.invoiceNumber,
    amountDue: formatCurrency(opts.amountDue, opts.currency),
    dueDate: formatDate(opts.dueDate),
    paymentUrl: opts.paymentUrl,
    freelancerName: opts.freelancerName,
    daysOverdue,
    firmDeadline: formatDate(firmDeadlineDate),
  }
}

export function renderStage1(vars: TemplateVars): RenderedEmail {
  const invoiceRef = vars.invoiceNumber ? `Invoice ${vars.invoiceNumber}` : "your invoice"
  const subject = `Quick note on ${invoiceRef}`
  const paymentLine = vars.paymentUrl
    ? `Here's the link to pay when you get a moment: ${vars.paymentUrl}`
    : "Please arrange payment at your earliest convenience."

  const text = `Hi ${vars.clientName},

Just a quick heads-up that ${invoiceRef} for ${vars.amountDue} became due on ${vars.dueDate}. Things get busy — totally understand! ${paymentLine}

Thanks so much,
${vars.freelancerName}`

  const html = `<p>Hi ${vars.clientName},</p>
<p>Just a quick heads-up that ${invoiceRef} for <strong>${vars.amountDue}</strong> became due on ${vars.dueDate}. Things get busy — totally understand!</p>
${vars.paymentUrl ? `<p><a href="${vars.paymentUrl}">Pay invoice →</a></p>` : ""}
<p>Thanks so much,<br>${vars.freelancerName}</p>`

  return { subject, html, text }
}

export function renderStage2(vars: TemplateVars): RenderedEmail {
  const invoiceRef = vars.invoiceNumber ? `Invoice ${vars.invoiceNumber}` : "your invoice"
  const subject = `Following up: ${invoiceRef} — ${vars.amountDue} Outstanding`

  const text = `Hi ${vars.clientName},

I'm following up on ${invoiceRef} for ${vars.amountDue}, which was due on ${vars.dueDate} and remains outstanding. Could you let me know when we can expect payment, or if there are any questions I can help with?

${vars.paymentUrl ? `Payment link: ${vars.paymentUrl}` : ""}

Best,
${vars.freelancerName}`

  const html = `<p>Hi ${vars.clientName},</p>
<p>I'm following up on ${invoiceRef} for <strong>${vars.amountDue}</strong>, which was due on ${vars.dueDate} and remains outstanding. Could you let me know when we can expect payment, or if there are any questions I can help with?</p>
${vars.paymentUrl ? `<p><a href="${vars.paymentUrl}">Pay invoice →</a></p>` : ""}
<p>Best,<br>${vars.freelancerName}</p>`

  return { subject, html, text }
}

export function renderStage3(vars: TemplateVars): RenderedEmail {
  const invoiceRef = vars.invoiceNumber ? `Invoice ${vars.invoiceNumber}` : "your invoice"
  const subject = `${invoiceRef} — ${vars.amountDue} Now ${vars.daysOverdue} Days Overdue`

  const text = `Dear ${vars.clientName},

I'm writing regarding ${invoiceRef} for ${vars.amountDue}, which is now ${vars.daysOverdue} days past its due date of ${vars.dueDate}. Per our agreement, payment was expected on that date.

Please arrange payment via the link below by ${vars.firmDeadline}, or contact me immediately to discuss.

${vars.paymentUrl ? `Payment link: ${vars.paymentUrl}` : ""}

${vars.freelancerName}`

  const html = `<p>Dear ${vars.clientName},</p>
<p>I'm writing regarding ${invoiceRef} for <strong>${vars.amountDue}</strong>, which is now <strong>${vars.daysOverdue} days</strong> past its due date of ${vars.dueDate}. Per our agreement, payment was expected on that date.</p>
<p>Please arrange payment via the link below by <strong>${vars.firmDeadline}</strong>, or contact me immediately to discuss.</p>
${vars.paymentUrl ? `<p><a href="${vars.paymentUrl}">Pay invoice →</a></p>` : ""}
<p>${vars.freelancerName}</p>`

  return { subject, html, text }
}

export function renderTemplate(stage: 1 | 2 | 3, vars: TemplateVars): RenderedEmail {
  switch (stage) {
    case 1: return renderStage1(vars)
    case 2: return renderStage2(vars)
    case 3: return renderStage3(vars)
  }
}
