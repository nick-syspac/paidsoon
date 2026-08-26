import { before, describe, test, mock } from "node:test"
import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TemplatesClient: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let formatAiRewriteErrorMessage: any

describe("TemplatesClient AI guardrail UI", () => {
  before(async () => {
    await mock.module("@/components/settings/TemplateEditor", {
      namedExports: {
        TEMPLATE_VARIABLES: [],
        TemplateEditor: () => <div data-testid="template-editor" />,
      },
    })

    ;({ TemplatesClient, formatAiRewriteErrorMessage } = await import(
      "@/components/settings/TemplatesClient"
    ))
  })

  test("shows remaining AI rewrite credits for eligible users", () => {
    const html = renderToStaticMarkup(
      <TemplatesClient
        canRewrite={true}
        initialRemainingMonthlyCredits={12}
        data={{
          tier: "small_business",
          templates: [{ id: "gentle-reminder", label: "Gentle reminder" }],
          canCustomize: true,
          stage: 1,
          subject: "Subject",
          htmlBody: "<p>Body</p>",
          textBody: "Body",
          isCustom: false,
        }}
      />,
    )

    assert.match(html, /AI rewrite credits remaining this period: 12/)
  })

  test("hides remaining AI rewrite credits when rewrite is not available", () => {
    const html = renderToStaticMarkup(
      <TemplatesClient
        canRewrite={false}
        initialRemainingMonthlyCredits={12}
        data={{
          tier: "starter",
          templates: [{ id: "gentle-reminder", label: "Gentle reminder" }],
          canCustomize: true,
          stage: 1,
          subject: "Subject",
          htmlBody: "<p>Body</p>",
          textBody: "Body",
          isCustom: false,
        }}
      />,
    )

    assert.doesNotMatch(html, /AI rewrite credits remaining this period:/)
  })

  test("formats usage-limit feedback with remaining credits", () => {
    assert.equal(
      formatAiRewriteErrorMessage({ error: "Usage limit reached", remainingMonthlyCredits: 0 }),
      "Usage limit reached. 0 credits remaining this period.",
    )

    assert.equal(
      formatAiRewriteErrorMessage({ error: "Rewrite failed" }),
      "Rewrite failed",
    )
  })
})
