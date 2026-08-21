import topology from "../../config/supabase-environment.json"

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const POOLER_HOST_PATTERN = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/

export type SupabaseConfigErrorCode =
  | "SUPABASE_PROJECT_REF_MISSING"
  | "SUPABASE_PROJECT_REF_INVALID"
  | "SUPABASE_DB_PASSWORD_MISSING"
  | "SUPABASE_DB_PASSWORD_INVALID"
  | "SUPABASE_POOLER_HOST_INVALID"
  | "SUPABASE_DERIVED_URL_INVALID"
  | "SUPABASE_LEGACY_CONFLICT"

export class SupabaseConfigError extends Error {
  readonly code: SupabaseConfigErrorCode
  readonly variableName: string

  constructor(code: SupabaseConfigErrorCode, variableName: string) {
    super(`${code}: invalid Supabase configuration for ${variableName}`)
    this.name = "SupabaseConfigError"
    this.code = code
    this.variableName = variableName
  }
}

export type PublicSupabaseConfig = {
  projectRef: string
  publicUrl: string
}

export type DatabaseSupabaseConfig = PublicSupabaseConfig & {
  poolerHost: string
  databaseUrl: string
  directUrl: string
}

function requireProjectRef(projectRef: string | undefined): string {
  if (projectRef === undefined) {
    throw new SupabaseConfigError(
      "SUPABASE_PROJECT_REF_MISSING",
      "SUPABASE_PROJECT_REF"
    )
  }
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new SupabaseConfigError(
      "SUPABASE_PROJECT_REF_INVALID",
      "SUPABASE_PROJECT_REF"
    )
  }
  return projectRef
}

function requirePoolerHost(poolerHost: string | undefined): string {
  const resolvedHost = poolerHost === undefined ? topology.defaultPoolerHost : poolerHost
  if (!POOLER_HOST_PATTERN.test(resolvedHost)) {
    throw new SupabaseConfigError(
      "SUPABASE_POOLER_HOST_INVALID",
      "SUPABASE_DB_POOLER_HOST"
    )
  }
  return resolvedHost
}

function encodePassword(password: string | undefined): string {
  if (!password) {
    throw new SupabaseConfigError(
      "SUPABASE_DB_PASSWORD_MISSING",
      "SUPABASE_DB_PASSWORD"
    )
  }

  try {
    return encodeURIComponent(password).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
  } catch {
    throw new SupabaseConfigError(
      "SUPABASE_DB_PASSWORD_INVALID",
      "SUPABASE_DB_PASSWORD"
    )
  }
}

function assertPublicUrl(url: string, projectRef: string): void {
  const parsed = new URL(url)
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${projectRef}.supabase.co` ||
    parsed.port !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new SupabaseConfigError(
      "SUPABASE_DERIVED_URL_INVALID",
      "NEXT_PUBLIC_SUPABASE_URL"
    )
  }
}

function assertDatabaseUrl(options: {
  url: string
  variableName: "DATABASE_URL" | "DIRECT_URL"
  projectRef: string
  encodedPassword: string
  poolerHost: string
  port: number
  runtime: boolean
}): void {
  const parsed = new URL(options.url)
  const expectedQuery = options.runtime
    ? `?pgbouncer=${topology.runtimeQuery.pgbouncer}&connection_limit=${topology.runtimeQuery.connection_limit}`
    : ""

  if (
    parsed.protocol !== "postgresql:" ||
    parsed.username !== `postgres.${options.projectRef}` ||
    parsed.password !== options.encodedPassword ||
    parsed.hostname !== options.poolerHost ||
    parsed.port !== String(options.port) ||
    parsed.pathname !== `/${topology.database}` ||
    parsed.search !== expectedQuery ||
    parsed.hash !== ""
  ) {
    throw new SupabaseConfigError(
      "SUPABASE_DERIVED_URL_INVALID",
      options.variableName
    )
  }
}

export function createPublicSupabaseConfig(
  projectRefInput: string | undefined
): PublicSupabaseConfig {
  const projectRef = requireProjectRef(projectRefInput)
  const publicUrl = `https://${projectRef}.supabase.co`
  assertPublicUrl(publicUrl, projectRef)
  return { projectRef, publicUrl }
}

export function createDatabaseSupabaseConfig(input: {
  projectRef: string | undefined
  password: string | undefined
  poolerHost?: string
}): DatabaseSupabaseConfig {
  const publicConfig = createPublicSupabaseConfig(input.projectRef)
  const poolerHost = requirePoolerHost(input.poolerHost)
  const encodedPassword = encodePassword(input.password)
  const username = `postgres.${publicConfig.projectRef}`
  const databaseUrl =
    `postgresql://${username}:${encodedPassword}@${poolerHost}:` +
    `${topology.runtimePort}/${topology.database}?` +
    `pgbouncer=${topology.runtimeQuery.pgbouncer}&` +
    `connection_limit=${topology.runtimeQuery.connection_limit}`
  const directUrl =
    `postgresql://${username}:${encodedPassword}@${poolerHost}:` +
    `${topology.migrationPort}/${topology.database}`

  assertDatabaseUrl({
    url: databaseUrl,
    variableName: "DATABASE_URL",
    projectRef: publicConfig.projectRef,
    encodedPassword,
    poolerHost,
    port: topology.runtimePort,
    runtime: true,
  })
  assertDatabaseUrl({
    url: directUrl,
    variableName: "DIRECT_URL",
    projectRef: publicConfig.projectRef,
    encodedPassword,
    poolerHost,
    port: topology.migrationPort,
    runtime: false,
  })

  return { ...publicConfig, poolerHost, databaseUrl, directUrl }
}