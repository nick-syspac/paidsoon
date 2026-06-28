import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  interpolate,
  resolveVars,
  DEFAULT_STAGE_1,
  DEFAULT_STAGE_2,
  DEFAULT_STAGE_3,
} from "../lib/email/templates"
import type { ResolvedTemplateVars } from "../lib/email/templates"

const baseVars = {
  clientName: "Sarah Johnson",
  amountDue: "£4,500.00",
  dueDate: "June 10, 2026",
  freelancerName: "John Smith",
}

describe("interpolate", () => {
  test("replaces known tokens", () => {
    const vars: ResolvedTemplateVars = {
      clientName: "Sarah",
      invoiceRef: "Invoice INV-042",
      amountDue: "£500.00",
      dueDate: "June 10, 2026",
      paymentLink: "",
      yourName: "John",
      daysOverdue: "",
      firmDeadline: "",
      promiseToPayLink: "",
    }
    const result = interpolate("Hi {{clientName}}, your {{invoiceRef}} is due.", vars)
    assert.equal(result, "Hi Sarah, your Invoice INV-042 is due.")
  })

  test("preserves unknown tokens unchanged", () => {
    const vars: ResolvedTemplateVars = {
      clientName: "Sarah",
      invoiceRef: "your invoice",
      amountDue: "£500.00",
      dueDate: "June 10, 2026",
      paymentLink: "",
      yourName: "John",
      daysOverdue: "",
      firmDeadline: "",
      promiseToPayLink: "",
    }
    const result = interpolate("Hello {{clientName}} and {{unknownToken}}", vars)
    assert.equal(result, "Hello Sarah and {{unknownToken}}")
  })
})

describe("resolveVars — invoiceRef", () => {
  test("resolves to 'Invoice N' when invoiceNumber is present", () => {
    const vars = resolveVars(1, { ...baseVars, invoiceNumber: "INV-042" })
    assert.equal(vars.invoiceRef, "Invoice INV-042")
  })

  test("resolves to 'your invoice' when invoiceNumber is absent", () => {
    const vars = resolveVars(1, { ...baseVars })
    assert.equal(vars.invoiceRef, "your invoice")
  })
})

describe("resolveVars — paymentLink", () => {
  test("resolves to anchor tag when paymentUrl is present", () => {
    const vars = resolveVars(1, { ...baseVars, paymentUrl: "https://pay.example.com/inv" })
    assert.ok(vars.paymentLink.includes("https://pay.example.com/inv"))
    assert.ok(vars.paymentLink.startsWith("<a href="))
  })

  test("resolves to empty string when paymentUrl is absent", () => {
    const vars = resolveVars(1, { ...baseVars })
    assert.equal(vars.paymentLink, "")
  })
})

describe("resolveVars — stage-scoped variables", () => {
  test("daysOverdue and firmDeadline are empty strings for Stage 1", () => {
    const vars = resolveVars(1, { ...baseVars, daysOverdue: 14, firmDeadline: "June 28, 2026" })
    assert.equal(vars.daysOverdue, "")
    assert.equal(vars.firmDeadline, "")
  })

  test("daysOverdue and firmDeadline are empty strings for Stage 2", () => {
    const vars = resolveVars(2, { ...baseVars, daysOverdue: 21, firmDeadline: "July 5, 2026" })
    assert.equal(vars.daysOverdue, "")
    assert.equal(vars.firmDeadline, "")
  })

  test("daysOverdue and firmDeadline resolve for Stage 3", () => {
    const vars = resolveVars(3, { ...baseVars, daysOverdue: 30, firmDeadline: "July 12, 2026" })
    assert.equal(vars.daysOverdue, "30")
    assert.equal(vars.firmDeadline, "July 12, 2026")
  })
})

describe("default templates produce output", () => {
  test("DEFAULT_STAGE_1 interpolates without errors", () => {
    const resolved = resolveVars(1, { ...baseVars, invoiceNumber: "INV-001", paymentUrl: "https://pay.example.com" })
    const subject = interpolate(DEFAULT_STAGE_1.subject, resolved)
    const html = interpolate(DEFAULT_STAGE_1.htmlBody, resolved)
    const text = interpolate(DEFAULT_STAGE_1.textBody, resolved)
    assert.ok(subject.includes("INV-001"))
    assert.ok(html.includes("Sarah Johnson"))
    assert.ok(text.includes("John Smith"))
  })

  test("DEFAULT_STAGE_2 interpolates without errors", () => {
    const resolved = resolveVars(2, { ...baseVars })
    const subject = interpolate(DEFAULT_STAGE_2.subject, resolved)
    assert.ok(subject.includes("£4,500.00"))
  })

  test("DEFAULT_STAGE_3 interpolates daysOverdue and firmDeadline", () => {
    const resolved = resolveVars(3, { ...baseVars, daysOverdue: 25, firmDeadline: "July 1, 2026" })
    const subject = interpolate(DEFAULT_STAGE_3.subject, resolved)
    assert.ok(subject.includes("25"))
    const html = interpolate(DEFAULT_STAGE_3.htmlBody, resolved)
    assert.ok(html.includes("July 1, 2026"))
  })
})
