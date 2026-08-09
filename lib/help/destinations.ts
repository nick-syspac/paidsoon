export type TrainingDestinationAudience = "public" | "signed_in"

export interface TrainingDestinationDefinition {
  key: string
  label: string
  href: string
  audience: TrainingDestinationAudience
}

const TOP_LEVEL_HELP_TOPIC = "/help"

export const TRAINING_DESTINATION_REGISTRY: Record<string, TrainingDestinationDefinition> = {
  "help.top": {
    key: "help.top",
    label: "Help Centre",
    href: TOP_LEVEL_HELP_TOPIC,
    audience: "public",
  },
  "dashboard.overview": {
    key: "dashboard.overview",
    label: "Dashboard overview",
    href: "/dashboard",
    audience: "signed_in",
  },
  "dashboard.invoices": {
    key: "dashboard.invoices",
    label: "Invoices",
    href: "/dashboard/invoices",
    audience: "signed_in",
  },
  "dashboard.resolved": {
    key: "dashboard.resolved",
    label: "Resolved invoices",
    href: "/dashboard/resolved",
    audience: "signed_in",
  },
  "settings.connections": {
    key: "settings.connections",
    label: "Settings - Connections",
    href: "/dashboard/settings/connections",
    audience: "signed_in",
  },
  "settings.templates": {
    key: "settings.templates",
    label: "Settings - Templates",
    href: "/dashboard/settings/templates",
    audience: "signed_in",
  },
  "settings.schedule": {
    key: "settings.schedule",
    label: "Settings - Schedule",
    href: "/dashboard/settings/schedule",
    audience: "signed_in",
  },
  "settings.subscription": {
    key: "settings.subscription",
    label: "Settings - Subscription",
    href: "/dashboard/settings/subscription",
    audience: "signed_in",
  },
} as const

export interface ResolveTrainingDestinationOptions {
  isAuthenticated: boolean
}

export interface ResolvedTrainingDestination {
  key: string
  label: string
  href: string
  usedFallback: boolean
  fallbackReason: "unknown_destination" | "requires_sign_in" | null
}

export function getTopLevelHelpTopic(): string {
  return TOP_LEVEL_HELP_TOPIC
}

export function resolveTrainingDestination(
  destinationKey: string,
  options: ResolveTrainingDestinationOptions
): ResolvedTrainingDestination {
  const definition = TRAINING_DESTINATION_REGISTRY[destinationKey]

  if (!definition) {
    return {
      key: destinationKey,
      label: "Help Centre",
      href: TOP_LEVEL_HELP_TOPIC,
      usedFallback: true,
      fallbackReason: "unknown_destination",
    }
  }

  if (definition.audience === "signed_in" && !options.isAuthenticated) {
    return {
      key: destinationKey,
      label: "Help Centre",
      href: TOP_LEVEL_HELP_TOPIC,
      usedFallback: true,
      fallbackReason: "requires_sign_in",
    }
  }

  return {
    key: definition.key,
    label: definition.label,
    href: definition.href,
    usedFallback: false,
    fallbackReason: null,
  }
}
