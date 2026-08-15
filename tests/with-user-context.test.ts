import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildRlsContextSetupSql } from "@/lib/db/withUserContext"

describe("withUserContext", () => {
  test("builds a single batched SQL statement for RLS claim GUCs", () => {
    const query = buildRlsContextSetupSql()

    assert.match(query, /request\.jwt\.claims/)
    assert.match(query, /request\.jwt\.claim\.sub/)
    assert.match(query, /request\.jwt\.claim\.role/)
    assert.match(query, /\$1/)
    assert.match(query, /\$2/)
  })
})
