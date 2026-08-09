import test from "node:test"
import assert from "node:assert/strict"
import { isLegacyHelpSlug, resolveCanonicalHelpSlug } from "@/lib/help/legacySlugs"

test("resolveCanonicalHelpSlug maps known legacy aliases", () => {
  assert.equal(resolveCanonicalHelpSlug("connect-myob-business"), "connect-myob")
  assert.equal(resolveCanonicalHelpSlug("promise-to-pay"), "record-a-promise-to-pay")
  assert.equal(resolveCanonicalHelpSlug("/reminder-schedule/"), "configure-reminder-schedule")
})

test("resolveCanonicalHelpSlug preserves canonical and index slugs", () => {
  assert.equal(resolveCanonicalHelpSlug("connect-xero"), "connect-xero")
  assert.equal(resolveCanonicalHelpSlug(""), "index")
})

test("isLegacyHelpSlug identifies aliases accurately", () => {
  assert.equal(isLegacyHelpSlug("connect-myob-business"), true)
  assert.equal(isLegacyHelpSlug("/promise-to-pay/"), true)
  assert.equal(isLegacyHelpSlug("connect-myob"), false)
})
