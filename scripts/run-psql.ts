import "./_loadEnv"

import path from "node:path"
import { spawnSync } from "node:child_process"

const sqlPath = process.argv[2]
if (!sqlPath) {
  console.error("ERROR: a repository SQL file path is required.")
  process.exit(1)
}

const resolvedSqlPath = path.resolve(sqlPath)
const prismaDirectory = `${path.resolve("prisma")}${path.sep}`
if (!resolvedSqlPath.startsWith(prismaDirectory) || !resolvedSqlPath.endsWith(".sql")) {
  console.error("ERROR: SQL path must be a .sql file under prisma/.")
  process.exit(1)
}

const directUrl = process.env.DIRECT_URL
if (!directUrl) {
  console.error("ERROR: canonical migration configuration is unavailable.")
  process.exit(1)
}

const parsed = new URL(directUrl)
const child = spawnSync(
  "psql",
  ["-v", "ON_ERROR_STOP=1", "-f", resolvedSqlPath],
  {
    stdio: "inherit",
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "development",
      PATH: process.env.PATH,
      PGHOST: parsed.hostname,
      PGPORT: parsed.port,
      PGDATABASE: parsed.pathname.replace(/^\//, ""),
      PGUSER: decodeURIComponent(parsed.username),
      PGPASSWORD: decodeURIComponent(parsed.password),
    },
  }
)

if (child.error) {
  console.error("ERROR: psql could not be started.")
  process.exit(1)
}
process.exit(child.status ?? 1)