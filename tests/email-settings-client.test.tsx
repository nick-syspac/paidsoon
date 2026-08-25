import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { EmailSettingsClient } from "@/components/settings/EmailSettingsClient"

describe("EmailSettingsClient", () => {
  test("renders Starter Reply-to as disabled with Solo+ upgrade messaging", () => {
    const html = renderToStaticMarkup(
      <EmailSettingsClient
        canUseCustomReplyTo={false}
        canUseCustomSenderName={false}
        canUseVerifiedDomain={false}
        settings={{
          fromEmail: null,
          fromName: null,
          replyTo: "starter@example.com",
          resendVerified: false,
        }}
        systemEmail="onboarding@paidsoon.com.au"
      />,
    )

    assert.match(html, /Upgrade to Solo or Small Business to set a custom reply-to address\./)
    assert.match(html, /Reply-to \(optional\)/)
    assert.match(html, /placeholder="replies@yourcompany.com"/)
    assert.match(html, /disabled=""/)
    assert.doesNotMatch(html, /Save email settings/)
  })

  test("renders editable Reply-to and save action for Solo+", () => {
    const html = renderToStaticMarkup(
      <EmailSettingsClient
        canUseCustomReplyTo={true}
        canUseCustomSenderName={true}
        canUseVerifiedDomain={false}
        settings={{
          fromEmail: null,
          fromName: "Acme",
          replyTo: "solo@example.com",
          resendVerified: false,
        }}
        systemEmail="onboarding@paidsoon.com.au"
      />,
    )

    assert.match(html, /Set a custom sender name and reply-to\./)
    assert.match(html, /Reply-to \(optional\)/)
    assert.match(html, /Save email settings/)
    assert.doesNotMatch(html, /Upgrade to Solo or Small Business to set a custom reply-to address\./)
  })
})
