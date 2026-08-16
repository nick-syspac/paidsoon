import {
  createDatabaseSupabaseConfig,
  createPublicSupabaseConfig,
  SupabaseConfigError,
} from "./supabaseEnvironment"

export type SupabaseEnvironmentMode =
  | "public"
  | "generate"
  | "runtime"
  | "migration"
  | "database-admin"

export type SupabaseEnvironment = Record<string, string | undefined>

export type ResolvedSupabaseEnvironment = {
  publicUrl: string
  databaseUrl?: string
  directUrl?: string
}

type LegacyVariableName =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "DATABASE_URL"
  | "DIRECT_URL"

function checkLegacyValue(options: {
  env: SupabaseEnvironment
  variableName: LegacyVariableName
  derivedValue: string
  onLegacyMatch?: (variableName: LegacyVariableName) => void
}): void {
  const legacyValue = options.env[options.variableName]
  if (legacyValue === undefined) return
  if (legacyValue !== options.derivedValue) {
    throw new SupabaseConfigError(
      "SUPABASE_LEGACY_CONFLICT",
      options.variableName
    )
  }
  options.onLegacyMatch?.(options.variableName)
}

export function resolveSupabaseEnvironment(options: {
  mode: SupabaseEnvironmentMode
  env: SupabaseEnvironment
  onLegacyMatch?: (variableName: LegacyVariableName) => void
}): ResolvedSupabaseEnvironment {
  const publicConfig = createPublicSupabaseConfig(options.env.SUPABASE_PROJECT_REF)
  checkLegacyValue({
    env: options.env,
    variableName: "NEXT_PUBLIC_SUPABASE_URL",
    derivedValue: publicConfig.publicUrl,
    onLegacyMatch: options.onLegacyMatch,
  })

  if (options.mode === "public" || options.mode === "generate") {
    return { publicUrl: publicConfig.publicUrl }
  }

  const databaseConfig = createDatabaseSupabaseConfig({
    projectRef: options.env.SUPABASE_PROJECT_REF,
    password: options.env.SUPABASE_DB_PASSWORD,
    poolerHost: options.env.SUPABASE_DB_POOLER_HOST,
  })
  checkLegacyValue({
    env: options.env,
    variableName: "DATABASE_URL",
    derivedValue: databaseConfig.databaseUrl,
    onLegacyMatch: options.onLegacyMatch,
  })
  checkLegacyValue({
    env: options.env,
    variableName: "DIRECT_URL",
    derivedValue: databaseConfig.directUrl,
    onLegacyMatch: options.onLegacyMatch,
  })

  if (options.mode === "runtime") {
    return {
      publicUrl: databaseConfig.publicUrl,
      databaseUrl: databaseConfig.databaseUrl,
    }
  }
  if (options.mode === "migration") {
    return {
      publicUrl: databaseConfig.publicUrl,
      directUrl: databaseConfig.directUrl,
    }
  }
  return {
    publicUrl: databaseConfig.publicUrl,
    databaseUrl: databaseConfig.databaseUrl,
    directUrl: databaseConfig.directUrl,
  }
}

export function materializeSupabaseEnvironment(options: {
  mode: SupabaseEnvironmentMode
  env?: SupabaseEnvironment
  onLegacyMatch?: (variableName: LegacyVariableName) => void
}): ResolvedSupabaseEnvironment {
  const env = options.env ?? process.env
  const resolved = resolveSupabaseEnvironment({
    mode: options.mode,
    env,
    onLegacyMatch: options.onLegacyMatch,
  })

  env.NEXT_PUBLIC_SUPABASE_URL = resolved.publicUrl
  if (resolved.databaseUrl !== undefined) {
    env.DATABASE_URL = resolved.databaseUrl
  }
  if (resolved.directUrl !== undefined) {
    env.DIRECT_URL = resolved.directUrl
  }
  return resolved
}

export function getPublicSupabaseEnvironment(
  env: SupabaseEnvironment = process.env
): ResolvedSupabaseEnvironment {
  return resolveSupabaseEnvironment({ mode: "public", env })
}