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

// ---------------------------------------------------------------------------
// Resolved variable set — all conditional logic pre-applied, safe for
// direct token substitution in user-authored and default templates.
// ---------------------------------------------------------------------------

export interface ResolvedTemplateVars {
  clientName: string
  invoiceRef: string       // "Invoice INV-042" | "your invoice"
  amountDue: string
  dueDate: string
  paymentLink: string      // <a href="...">Pay invoice →</a> | ""
  yourName: string
  daysOverdue: string      // integer string | "" for Stage 1/2
  firmDeadline: string     // formatted date | "" for Stage 1/2
}

export function resolveVars(stage: 1 | 2 | 3, vars: TemplateVars): ResolvedTemplateVars {
  const invoiceRef = vars.invoiceNumber ? `Invoice ${vars.invoiceNumber}` : "your invoice"
  const paymentLink = vars.paymentUrl
    ? `<a href="${vars.paymentUrl}">Pay invoice →</a>`
    : ""
  const isStage3 = stage === 3
  return {
    clientName: vars.clientName,
    invoiceRef,
    amountDue: vars.amountDue,
    dueDate: vars.dueDate,
    paymentLink,
    yourName: vars.freelancerName,
    daysOverdue: isStage3 && vars.daysOverdue != null ? String(vars.daysOverdue) : "",
    firmDeadline: isStage3 && vars.firmDeadline != null ? vars.firmDeadline : "",
  }
}

// ---------------------------------------------------------------------------
// Interpolation engine — replaces {{token}} occurrences; unknown tokens
// are preserved unchanged.
// ---------------------------------------------------------------------------

export function interpolate(template: string, vars: ResolvedTemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key)
      ? (vars as Record<string, string>)[key]
      : match
  })
}

// ---------------------------------------------------------------------------
// Default template strings — use {{token}} syntax so they can seed the
// editor and pass through the same interpolation path as custom templates.
// ---------------------------------------------------------------------------

export const DEFAULT_STAGE_1 = {
  subject: `Quick note on {{invoiceRef}}`,
  htmlBody: `<p>Hi {{clientName}},</p>
<p>Just a quick heads-up that {{invoiceRef}} for <strong>{{amountDue}}</strong> became due on {{dueDate}}. Things get busy — totally understand!</p>
<p>{{paymentLink}}</p>
<p>Thanks so much,<br>{{yourName}}</p>`,
  textBody: `Hi {{clientName}},

Just a quick heads-up that {{invoiceRef}} for {{amountDue}} became due on {{dueDate}}. Things get busy — totally understand!
{{paymentLink}}
Thanks so much,
{{yourName}}`,
}

export const DEFAULT_STAGE_2 = {
  subject: `Following up: {{invoiceRef}} — {{amountDue}} Outstanding`,
  htmlBody: `<p>Hi {{clientName}},</p>
<p>I'm following up on {{invoiceRef}} for <strong>{{amountDue}}</strong>, which was due on {{dueDate}} and remains outstanding. Could you let me know when we can expect payment, or if there are any questions I can help with?</p>
<p>{{paymentLink}}</p>
<p>Best,<br>{{yourName}}</p>`,
  textBody: `Hi {{clientName}},

I'm following up on {{invoiceRef}} for {{amountDue}}, which was due on {{dueDate}} and remains outstanding. Could you let me know when we can expect payment, or if there are any questions I can help with?
{{paymentLink}}
Best,
{{yourName}}`,
}

export const DEFAULT_STAGE_3 = {
  subject: `{{invoiceRef}} — {{amountDue}} Now {{daysOverdue}} Days Overdue`,
  htmlBody: `<p>Dear {{clientName}},</p>
<p>I'm writing regarding {{invoiceRef}} for <strong>{{amountDue}}</strong>, which is now <strong>{{daysOverdue}} days</strong> past its due date of {{dueDate}}. Per our agreement, payment was expected on that date.</p>
<p>Please arrange payment via the link below by <strong>{{firmDeadline}}</strong>, or contact me immediately to discuss.</p>
<p>{{paymentLink}}</p>
<p>{{yourName}}</p>`,
  textBody: `Dear {{clientName}},

I'm writing regarding {{invoiceRef}} for {{amountDue}}, which is now {{daysOverdue}} days past its due date of {{dueDate}}. Per our agreement, payment was expected on that date.

Please arrange payment by {{firmDeadline}}, or contact me immediately to discuss.
{{paymentLink}}
{{yourName}}`,
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
  const resolved = resolveVars(1, vars)
  return {
    subject: interpolate(DEFAULT_STAGE_1.subject, resolved),
    html: interpolate(DEFAULT_STAGE_1.htmlBody, resolved),
    text: interpolate(DEFAULT_STAGE_1.textBody, resolved),
  }
}

export function renderStage2(vars: TemplateVars): RenderedEmail {
  const resolved = resolveVars(2, vars)
  return {
    subject: interpolate(DEFAULT_STAGE_2.subject, resolved),
    html: interpolate(DEFAULT_STAGE_2.htmlBody, resolved),
    text: interpolate(DEFAULT_STAGE_2.textBody, resolved),
  }
}

export function renderStage3(vars: TemplateVars): RenderedEmail {
  const resolved = resolveVars(3, vars)
  return {
    subject: interpolate(DEFAULT_STAGE_3.subject, resolved),
    html: interpolate(DEFAULT_STAGE_3.htmlBody, resolved),
    text: interpolate(DEFAULT_STAGE_3.textBody, resolved),
  }
}

export function renderTemplate(stage: 1 | 2 | 3, vars: TemplateVars): RenderedEmail {
  switch (stage) {
    case 1: return renderStage1(vars)
    case 2: return renderStage2(vars)
    case 3: return renderStage3(vars)
  }
}
