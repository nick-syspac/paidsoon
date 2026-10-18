import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

test("targeted trial security deployment matches canonical policies", () => {
  const canonical = readFileSync("prisma/rls-policies.sql", "utf8")
  const standalone = readFileSync("prisma/tenant-trial-access-policies.sql", "utf8")
  const block = canonical.split("-- BEGIN TENANT TRIAL ACCESS POLICIES\n")[1]?.split("-- END TENANT TRIAL ACCESS POLICIES")[0]
  assert.ok(block)
  const body = standalone.slice(standalone.indexOf("ALTER TABLE"))
  assert.equal(block.trim(), body.trim())
})