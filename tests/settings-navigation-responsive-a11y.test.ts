import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"

const componentPath = path.join(process.cwd(), "components/settings/SettingsNavigation.tsx")
const source = readFileSync(componentPath, "utf8")

describe("settings navigation responsive accessibility contract", () => {
  test("keeps semantic navigation and section toggles", () => {
    assert.match(source, /aria-label="Settings navigation"/)
    assert.match(source, /aria-expanded=\{isExpanded\}/)
    assert.match(source, /aria-controls=\{`settings-group-\$\{group.id\}`\}/)
  })

  test("provides settings search and responsive visibility controls", () => {
    assert.match(source, /type="search"/)
    assert.match(source, /placeholder="Find a setting"/)
    assert.match(source, /md:hidden/)
    assert.match(source, /hidden md:block/)
  })
})
