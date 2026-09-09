import type { OwnersDigestSnapshotRecord } from "@/lib/ownersDigest/types"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export interface OwnersDigestEmailContent {
  subject: string
  html: string
  text: string
}

function statusLabel(status: OwnersDigestSnapshotRecord["status"]): string {
  switch (status) {
    case "critical":
      return "CRITICAL"
    case "action_required":
      return "ACTION REQUIRED"
    case "watch":
      return "WATCH"
    case "healthy":
      return "HEALTHY"
  }
}

export function buildOwnersDigestEmail(input: {
  tenantName: string
  digest: OwnersDigestSnapshotRecord
}): OwnersDigestEmailContent {
  const attention = input.digest.items.filter((item) => item.section === "needs_attention").slice(0, 3)
  const positives = input.digest.items.filter((item) => item.section === "positive_changes").slice(0, 3)
  const opportunities = input.digest.items.filter((item) => item.section === "opportunities").slice(0, 3)

  const attentionLines =
    attention.length > 0
      ? attention
          .map(
            (item, index) =>
              `<li><strong>${index + 1}. ${escapeHtml(item.title)}</strong><br>${escapeHtml(item.summary)}${item.actionUrl ? `<br><a href="${escapeHtml(item.actionUrl)}">View details</a>` : ""}</li>`,
          )
          .join("")
      : "<li>No material issues require attention right now.</li>"

  const positiveLines =
    positives.length > 0
      ? `<ul>${positives
          .map((item) => `<li><strong>${escapeHtml(item.title)}</strong> - ${escapeHtml(item.summary)}</li>`)
          .join("")}</ul>`
      : "<p>No material positive changes were surfaced in this period.</p>"

  const opportunityLines =
    opportunities.length > 0
      ? `<ul>${opportunities
          .map((item) => `<li><strong>${escapeHtml(item.title)}</strong> - ${escapeHtml(item.summary)}</li>`)
          .join("")}</ul>`
      : "<p>No major savings opportunities were highlighted in this period.</p>"

  const subject = attention.length > 0
    ? `Your PaidSoon Owner's Digest - ${attention.length} thing${attention.length === 1 ? "" : "s"} need your attention`
    : "Your PaidSoon Owner's Digest - everything looks on track"

  const html = `
    <p>Hi ${escapeHtml(input.tenantName)},</p>
    <p><strong>Overall status: ${escapeHtml(statusLabel(input.digest.status))}</strong></p>
    <p>${escapeHtml(input.digest.summary)}</p>
    <h2>Needs Your Attention</h2>
    <ol>${attentionLines}</ol>
    <h2>Positive Changes</h2>
    ${positiveLines}
    <h2>Opportunities</h2>
    ${opportunityLines}
    <p><a href="/dashboard/owners-digest/${escapeHtml(input.digest.id)}">View full Owner's Digest</a></p>
    <p>Thanks,<br>PaidSoon</p>
  `

  const text = [
    `Hi ${input.tenantName},`,
    "",
    `Overall status: ${statusLabel(input.digest.status)}`,
    input.digest.summary,
    "",
    "Needs Your Attention",
    ...(attention.length > 0
      ? attention.map((item, index) => `${index + 1}. ${item.title} - ${item.summary}`)
      : ["No material issues require attention right now."]),
    "",
    "Positive Changes",
    ...(positives.length > 0
      ? positives.map((item) => `- ${item.title}: ${item.summary}`)
      : ["No material positive changes were surfaced in this period."]),
    "",
    "Opportunities",
    ...(opportunities.length > 0
      ? opportunities.map((item) => `- ${item.title}: ${item.summary}`)
      : ["No major savings opportunities were highlighted in this period."]),
    "",
    `View full Owner's Digest: /dashboard/owners-digest/${input.digest.id}`,
    "",
    "Thanks,",
    "PaidSoon",
  ].join("\n")

  return { subject, html, text }
}
