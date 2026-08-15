import assert from "node:assert/strict"
import { test } from "node:test"
import { config } from "@/proxy"

test("auth proxy runs only for routes that need proxy-level auth behavior", () => {
  assert.deepStrictEqual(config.matcher, [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/sign-in",
    "/sign-up",
  ])
  assert.ok(!config.matcher.includes("/:path*"))
  assert.ok(!config.matcher.some((matcher) => matcher.startsWith("/api/:")))
})